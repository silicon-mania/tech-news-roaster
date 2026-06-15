#!/usr/bin/env node
// Throwaway spike probe for issue 007 — verify retrieval-provider X-search-operator passthrough.
//
// Question it answers: does TwitterAPI.io's advanced-search endpoint honor the native X search
// operators `list:`, `min_retweets:`, and `min_faves:`? The answer picks the Tweet Discovery
// branch the List-timeline adapter (issue 014) will implement:
//   - HONORED  → X pre-filters server-side; a Discovery Sweep is a handful of calls.
//   - IGNORED  → the sweep must pull full List timelines and apply the virality bar in-house.
//
// This is operator-driven and makes REAL, credit-metered provider calls (~5 per run). It ships no
// app code; it just gathers a recorded decision. Run it, then paste the final block back.
//
// Usage:
//   node --env-file=.env.local scripts/probe-x-search-operators.mjs
//
// Requires TWITTERAPI_IO_API_KEY in the environment (.env.local already holds it in dev).
// Optional overrides (env vars), all with sane defaults:
//   PROBE_BASE_TERM     base search term, high-volume so the unfiltered stream has low-engagement
//                       tweets to filter out (default "AI")
//   PROBE_MIN_RETWEETS  threshold for the min_retweets: test (default 100)
//   PROBE_MIN_FAVES     threshold for the min_faves: test (default 100)
//   PROBE_LIST_ID       X List id for the list: test. If unset, the list: test is SKIPPED. Use a
//                       list you own that has recent activity (e.g. one of the discovery Lists).
//   PROBE_LIST_MEMBER   optional username known to be in PROBE_LIST_ID, used as a cross-check.
//   PROBE_SEARCH_PATH   advanced-search path (default "/twitter/tweet/advanced_search").
//   PROBE_QUERY_TYPE    "Latest" or "Top" (default "Latest" — Latest surfaces fresh low-engagement
//                       tweets, which makes an ignored min_* filter obvious).
//   PROBE_DELAY_MS      ms to wait between calls to dodge the free-tier rate limit (default 6000;
//                       free keys are throttled to ~1 request / 5s, so the default run takes ~30s).
//   PROBE_MAX_RETRIES   max retries on HTTP 429, with backoff honoring x-rate-limit-reset (default 5).

const BASE_URL = "https://api.twitterapi.io";
const SEARCH_PATH = process.env.PROBE_SEARCH_PATH ?? "/twitter/tweet/advanced_search";
const QUERY_TYPE = process.env.PROBE_QUERY_TYPE ?? "Latest";
const BASE_TERM = process.env.PROBE_BASE_TERM ?? "AI";
const MIN_RETWEETS = Number.parseInt(process.env.PROBE_MIN_RETWEETS ?? "100", 10);
const MIN_FAVES = Number.parseInt(process.env.PROBE_MIN_FAVES ?? "100", 10);
const LIST_ID = process.env.PROBE_LIST_ID ?? "";
const LIST_MEMBER = (process.env.PROBE_LIST_MEMBER ?? "").replace(/^@/, "").toLowerCase();
const DELAY_MS = Number.parseInt(process.env.PROBE_DELAY_MS ?? "6000", 10);
const MAX_RETRIES = Number.parseInt(process.env.PROBE_MAX_RETRIES ?? "5", 10);

const apiKey = process.env.TWITTERAPI_IO_API_KEY;

if (!apiKey) {
  console.error("Missing TWITTERAPI_IO_API_KEY.");
  console.error("Run with:  node --env-file=.env.local scripts/probe-x-search-operators.mjs");
  process.exit(1);
}

let priorRequests = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Free TwitterAPI.io keys are throttled to ~1 request / 5s (paid balance raises QPS). Wait until
// the rate-limit window resets — x-rate-limit-reset is a Unix timestamp — else fall back to
// exponential backoff, so the probe measures operator behavior rather than rate limiting.
function retryWaitMs(response, attempt) {
  const reset = response.headers.get("x-rate-limit-reset");
  if (reset) {
    const untilReset = Number(reset) * 1000 - Date.now();
    if (Number.isFinite(untilReset) && untilReset > 0) {
      return Math.min(untilReset + 500, 60_000);
    }
  }
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000 + 500, 60_000);
    }
  }
  return Math.min(DELAY_MS * 2 ** attempt, 60_000);
}

async function search(query) {
  const url = new URL(`${BASE_URL}${SEARCH_PATH}`);
  url.searchParams.set("query", query);
  url.searchParams.set("queryType", QUERY_TYPE);

  for (let attempt = 0; ; attempt += 1) {
    // Pace distinct queries; on a retry the 429 backoff below already supplied the wait.
    if (attempt === 0 && priorRequests > 0) {
      await sleep(DELAY_MS);
    }
    priorRequests += 1;

    const startedAt = performance.now();
    let response;
    try {
      response = await fetch(url, {
        headers: { "x-api-key": apiKey, Accept: "application/json" },
      });
    } catch (error) {
      return { query, url: url.toString(), ok: false, status: 0, error: String(error), tweets: [] };
    }
    const ms = Math.round(performance.now() - startedAt);

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const waitMs = retryWaitMs(response, attempt);
      console.log(
        `  …429 rate-limited — waiting ${Math.round(waitMs / 1000)}s, retry ${attempt + 1}/${MAX_RETRIES}`,
      );
      await sleep(waitMs);
      continue;
    }

    const bodyText = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = null;
    }

    return {
      query,
      url: url.toString(),
      ok: response.ok,
      status: response.status,
      ms,
      error: response.ok ? null : bodyText.slice(0, 400),
      tweets: extractTweets(payload),
    };
  }
}

function extractTweets(payload) {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of ["tweets", "data", "results"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
    if (isRecord(value)) {
      const nested = extractTweets(value);
      if (nested.length > 0) {
        return nested;
      }
    }
  }
  return [];
}

function readNumber(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}

function readAuthor(record) {
  const author = isRecord(record.author) ? record.author : isRecord(record.user) ? record.user : {};
  for (const key of ["userName", "username", "screen_name", "screenName"]) {
    const value = author[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().toLowerCase();
    }
  }
  return "unknown";
}

function readText(record) {
  for (const key of ["text", "full_text", "tweetText", "content"]) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
}

const likesOf = (t) => readNumber(t, ["likeCount", "likes", "favorite_count", "favoriteCount"]);
const repostsOf = (t) => readNumber(t, ["retweetCount", "reposts", "retweets", "retweet_count"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stats(values) {
  if (values.length === 0) {
    return { min: null, median: null, max: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  return { min: sorted[0], median, max: sorted[sorted.length - 1] };
}

function describe(label, res, metricOf) {
  if (!res.ok) {
    console.log(`  ${label} → HTTP ${res.status} ERROR  ${res.error ?? ""}`);
    return;
  }
  const metrics = res.tweets.map(metricOf);
  const s = stats(metrics);
  console.log(
    `  ${label} → HTTP ${res.status} | ${res.tweets.length} tweets | ${res.ms}ms | ` +
      `min/med/max = ${s.min}/${s.median}/${s.max}`,
  );
}

// Decide a min_* operator verdict from a baseline (no operator) / filtered (operator) pair.
function verdictForMinOperator({ baseline, filtered, threshold, metricOf }) {
  if (!filtered.ok) {
    return { verdict: "ERROR", note: `filtered query failed: HTTP ${filtered.status}` };
  }
  const violations = filtered.tweets.filter((t) => metricOf(t) < threshold).length;
  const baselineSubThreshold = baseline.ok
    ? baseline.tweets.filter((t) => metricOf(t) < threshold).length
    : 0;

  if (filtered.tweets.length === 0) {
    return {
      verdict: "INCONCLUSIVE",
      violations,
      baselineSubThreshold,
      note: "filtered query returned 0 tweets — lower the threshold or try PROBE_QUERY_TYPE=Top, then re-run",
    };
  }
  if (violations > 0) {
    return {
      verdict: "IGNORED",
      violations,
      baselineSubThreshold,
      note: `${violations}/${filtered.tweets.length} returned tweets are below the threshold — operator not applied`,
    };
  }
  if (baseline.ok && baselineSubThreshold === 0) {
    return {
      verdict: "INCONCLUSIVE",
      violations,
      baselineSubThreshold,
      note: "baseline had no sub-threshold tweets, so a no-op filter is indistinguishable — pick a higher-volume PROBE_BASE_TERM",
    };
  }
  return {
    verdict: "HONORED",
    violations,
    baselineSubThreshold,
    note: "every filtered tweet meets the threshold while the baseline contained sub-threshold tweets",
  };
}

async function runMinOperatorTest({ name, operator, threshold, metricOf }) {
  const baselineQuery = `${BASE_TERM} lang:en`;
  const filteredQuery = `${BASE_TERM} ${operator}:${threshold} lang:en`;

  console.log(`\n${"─".repeat(70)}`);
  console.log(`TEST: ${operator}:  (threshold = ${threshold})`);
  console.log(`  baseline query : ${baselineQuery}`);
  console.log(`  filtered query : ${filteredQuery}`);

  const baseline = await search(baselineQuery);
  const filtered = await search(filteredQuery);

  describe("baseline", baseline, metricOf);
  describe("filtered", filtered, metricOf);

  const result = verdictForMinOperator({ baseline, filtered, threshold, metricOf });
  console.log(`  VERDICT: ${result.verdict}  — ${result.note}`);

  return {
    [name]: {
      threshold,
      verdict: result.verdict,
      filteredCount: filtered.ok ? filtered.tweets.length : null,
      filteredStatus: filtered.status,
      violations: result.violations ?? null,
      baselineSubThreshold: result.baselineSubThreshold ?? null,
    },
  };
}

async function runListTest() {
  console.log(`\n${"─".repeat(70)}`);
  console.log("TEST: list:");

  if (!LIST_ID) {
    console.log("  SKIPPED — set PROBE_LIST_ID to an X List id you own with recent activity.");
    return { list: { verdict: "SKIPPED", note: "PROBE_LIST_ID not set" } };
  }

  const query = `list:${LIST_ID}`;
  console.log(`  query : ${query}`);
  const res = await search(query);

  if (!res.ok) {
    console.log(`  ${"result"} → HTTP ${res.status} ERROR  ${res.error ?? ""}`);
    console.log("  VERDICT: ERROR — provider rejected the query (may mean list: is unsupported)");
    return { list: { verdict: "ERROR", listId: LIST_ID, status: res.status } };
  }

  const authors = res.tweets.map(readAuthor);
  const distinctAuthors = [...new Set(authors)];
  const literalMatch = res.tweets.some((t) => readText(t).includes(`list:${LIST_ID}`));
  const memberSeen = LIST_MEMBER ? distinctAuthors.includes(LIST_MEMBER) : null;

  console.log(`  result → HTTP ${res.status} | ${res.tweets.length} tweets | ${res.ms}ms`);
  console.log(`  distinct authors (${distinctAuthors.length}): ${distinctAuthors.join(", ")}`);
  console.log("  sample:");
  for (const t of res.tweets.slice(0, 5)) {
    console.log(`    @${readAuthor(t)}: ${readText(t).replace(/\s+/g, " ").slice(0, 90)}`);
  }
  if (LIST_MEMBER) {
    console.log(`  known member @${LIST_MEMBER} present among authors: ${memberSeen}`);
  }

  let verdict;
  let note;
  if (res.tweets.length === 0) {
    verdict = "LIKELY_NOT_HONORED";
    note =
      "empty result — a live list should return tweets; literal 'list:ID' text-search finds nothing";
  } else if (literalMatch) {
    verdict = "LIKELY_NOT_HONORED";
    note =
      "returned tweets contain the literal 'list:ID' text — treated as a keyword, not an operator";
  } else if (memberSeen === true) {
    verdict = "LIKELY_HONORED";
    note = "known list member appears among authors";
  } else if (distinctAuthors.length >= 2) {
    verdict = "LIKELY_HONORED";
    note = "multiple distinct authors returned — CONFIRM these are members of the list";
  } else {
    verdict = "INCONCLUSIVE";
    note = "single author / unclear — CONFIRM whether this matches the list's membership";
  }
  console.log(`  VERDICT: ${verdict} — ${note}`);

  return {
    list: {
      verdict,
      listId: LIST_ID,
      count: res.tweets.length,
      distinctAuthors: distinctAuthors.length,
      literalMatch,
      knownMemberPresent: memberSeen,
    },
  };
}

async function main() {
  console.log("X-search-operator passthrough probe (issue 007)");
  console.log(`  provider   : ${BASE_URL}${SEARCH_PATH}`);
  console.log(`  queryType  : ${QUERY_TYPE}`);
  console.log(`  base term  : "${BASE_TERM}"`);
  console.log(`  pacing     : ${DELAY_MS}ms between calls, up to ${MAX_RETRIES} retries on 429`);
  console.log("  (free-tier keys allow ~1 call / 5s, so this run takes ~30s — that's expected)");

  const summary = { provider: "twitterapi.io", searchPath: SEARCH_PATH, queryType: QUERY_TYPE };

  Object.assign(
    summary,
    await runMinOperatorTest({
      name: "min_faves",
      operator: "min_faves",
      threshold: MIN_FAVES,
      metricOf: likesOf,
    }),
  );
  Object.assign(
    summary,
    await runMinOperatorTest({
      name: "min_retweets",
      operator: "min_retweets",
      threshold: MIN_RETWEETS,
      metricOf: repostsOf,
    }),
  );
  Object.assign(summary, await runListTest());

  console.log(`\n${"=".repeat(70)}`);
  console.log("=== PASTE THIS BLOCK BACK TO CLAUDE ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("=== END ===");
}

main().catch((error) => {
  console.error("Probe crashed:", error);
  process.exit(1);
});
