#!/usr/bin/env node
// Throwaway operator smoke for issue 026 — validate the categorized Visual Joke
// Workflow against the REAL Vercel AI Gateway. Unlike the fixture-based test suite
// (which stays fast and deterministic), this makes a single real, credit-metered
// LLM call so a human can judge joke quality across the three sections and tune
// the Default Visual Joke Direction — now the only taste lever, since the local
// Visual Joke Critic is gone (ADR 0022).
//
// It imports the REAL service (`generateVisualJokeSet`) and the LIVE
// `defaultVisualJokeDirection`, so it exercises the exact production path: the
// same model/env resolution, the same Structured-Outputs request + response_format
// negotiation, and the same parse + categorized-set assembly. Editing the direction
// prompt changes this smoke too — there is no hardcoded copy to drift out of sync.
//
// Run (needs tsx to resolve the `@/*` path aliases; npx fetches it on demand):
//
//   # DRY RUN — prints the resolved config + the live direction, makes NO API call:
//   npx tsx --env-file=.env.local scripts/smoke-visual-joke-set.ts
//
//   # LIVE — one real metered call, prints the categorized set for human review:
//   SMOKE_LIVE=1 npx tsx --env-file=.env.local scripts/smoke-visual-joke-set.ts
//
// Live needs AI_GATEWAY_API_KEY (or VERCEL_AI_GATEWAY_API_KEY) in the environment;
// `.env.local` is the usual home. The smoke honors AI_GATEWAY_VISUAL_JOKE_MODEL,
// AI_GATEWAY_BASE_URL, and AI_GATEWAY_VISUAL_JOKE_TIMEOUT_MS exactly like the app,
// so it doubles as the "model/env/config confirmed working" check.

import {
  defaultVisualJokeDirection,
  type JokeContextSnapshot,
  parseJokeContextSnapshot,
  targetPerSection,
  type VisualJokeSet,
  visualJokeSections,
} from "@/services/generation";
import {
  readConfiguredAiGatewayVisualJokeModel,
  readEnvValue,
} from "@/services/generation/ai-gateway-models";
import {
  generateVisualJokeSet,
  VisualJokeGenerationError,
} from "@/services/generation/visual-joke-service";

const defaultBaseUrl = "https://ai-gateway.vercel.sh/v1";
const defaultTimeoutMs = 60_000;
const dividerWidth = 74;

const live = readEnvValue(process.env.SMOKE_LIVE) !== undefined;
// Mirror the adapter's own key + config resolution so the printed banner reflects
// exactly what a real run would use.
const apiKey =
  readEnvValue(process.env.AI_GATEWAY_API_KEY) ??
  readEnvValue(process.env.VERCEL_AI_GATEWAY_API_KEY);
const model = readConfiguredAiGatewayVisualJokeModel(process.env);
const baseUrl = readEnvValue(process.env.AI_GATEWAY_BASE_URL) ?? defaultBaseUrl;
const timeoutMs =
  readEnvValue(process.env.AI_GATEWAY_VISUAL_JOKE_TIMEOUT_MS) ?? `${defaultTimeoutMs}`;

// A realistic, named Joke Context Snapshot. The direction leans on real specifics
// ("the weirdest true detail is usually the joke"), so this carries concrete
// numbers, quotes, and a named subject. Swap in a real story to smoke a fresh one;
// `parseJokeContextSnapshot` validates the shape and fails loudly if it drifts.
const jokeContextSnapshot: JokeContextSnapshot = parseJokeContextSnapshot({
  capturedAt: "2026-06-17T09:00:00.000Z",
  sourceTweetId: "smoke-026",
  structuredContext: {
    authorContext: {
      authoritySignals: ["Posts launch screenshots", "Followed by AI engineers"],
      displayName: "Nexa AI",
      handle: "nexa_ai",
      relationshipToTopic: "The company shipping the product in the story.",
      role: "AI startup",
    },
    forbiddenAssumptions: [
      "Do not claim the product replaces entire engineering teams.",
      "Do not invent revenue figures that were not stated.",
    ],
    jokeContextQuality: {
      status: "strong",
      summary:
        "A named subject, exact numbers, and pointed replies give plenty for grounded satire.",
    },
    jokeableTensions: [
      "A tool sold as 'fully autonomous' still ships with a human-in-the-loop approval step.",
      "The launch promises to cut costs while introducing per-seat and per-token pricing.",
    ],
    replySignals: {
      representativeSnippets: [
        {
          authorHandle: "shipittoday",
          replyId: "smoke-026-reply-1",
          signal: "skepticism",
          snippet:
            "so the agent is autonomous except for the part where I approve everything it does",
        },
        {
          authorHandle: "vc_brain",
          replyId: "smoke-026-reply-2",
          signal: "hype",
          snippet: "this is the iPhone moment for back-office ops, calling it now",
        },
      ],
      summary: "Replies split between pricing skepticism and breathless 'iPhone moment' hype.",
    },
    sourceTweetClaim:
      "Nexa AI launches 'Atlas', a fully autonomous agent it says replaces 80% of a company's manual ops work, starting at $499/seat/month.",
    sourceTweetMediaExtraction: {
      mediaKinds: ["image"],
      notableDetails: [
        "The demo video shows the agent pausing for a human to click 'Approve' on every action.",
        "A pricing card lists '$499/seat/mo + usage' in small print under '80% less manual work'.",
      ],
      summary: "A launch card and demo video for an autonomous ops agent called Atlas.",
      visibleText: ["80% less manual work", "Fully autonomous", "$499/seat/mo + usage"],
    },
    supportingFacts: [
      "The launch post quotes the CEO calling Atlas 'the end of the back office'.",
      "Atlas requires human approval on each action in the launch-day demo.",
      "Pricing is $499 per seat per month plus per-token usage fees.",
      "The thread has 4,200 reposts within three hours.",
    ],
    unknowns: ["No independent benchmark of the '80%' figure exists yet."],
  },
});

async function main() {
  divider("Visual Joke smoke — resolved config (matches the live adapter)");
  console.log(`provider model       : ${model}`);
  console.log(`AI Gateway API key   : ${apiKey ? "present" : "MISSING"}`);
  console.log(`base URL             : ${baseUrl}`);
  console.log(`timeout (ms)         : ${timeoutMs}`);
  console.log(
    `mode                 : ${live ? "LIVE (one real metered call)" : "DRY RUN (no API call)"}`,
  );

  divider("Default Visual Joke Direction (the live prompt sent to the model)");
  console.log(defaultVisualJokeDirection);

  divider("Joke Context Snapshot (the 'story' appended to the direction)");
  console.log(JSON.stringify(jokeContextSnapshot, null, 2));

  if (!live) {
    divider("DRY RUN complete — no API budget spent");
    console.log("To make the real call, re-run with SMOKE_LIVE=1:");
    console.log("  SMOKE_LIVE=1 npx tsx --env-file=.env.local scripts/smoke-visual-joke-set.ts");
    return;
  }

  if (!apiKey) {
    console.error(
      "\nSMOKE_LIVE is set but no AI Gateway API key was found. Refusing to run: without\n" +
        "a key the service silently falls back to the LOCAL fixture provider, which would\n" +
        "NOT be a real smoke. Set AI_GATEWAY_API_KEY (or VERCEL_AI_GATEWAY_API_KEY) in\n" +
        ".env.local and re-run.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    console.log("\nCalling the AI Gateway... (one real metered request)");
    const { visualJokeSet } = await generateVisualJokeSet({
      jokeContextSnapshot,
      visualJokeDirection: defaultVisualJokeDirection,
    });
    renderVisualJokeSet(visualJokeSet);
    printPasteBackBlock(visualJokeSet);
  } catch (error) {
    divider("Visual joke generation FAILED");
    if (error instanceof VisualJokeGenerationError) {
      console.error(error.message);
      if (error.debugLog) {
        console.error("\nQuiet Failure Details (debugLog):");
        for (const detail of error.debugLog) {
          console.error(`  ${detail}`);
        }
      }
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

function divider(label: string) {
  const line = "-".repeat(dividerWidth);
  console.log(`\n${line}\n${label}\n${line}`);
}

// Group jokes by section in direction order, flag the model's Top Picks inline, and
// surface the per-section shortfall the way the UI does ("showing X of 7").
function renderVisualJokeSet(set: VisualJokeSet) {
  const topPickRankById = new Map(
    set.topPicks.map((pick, index) => [pick.visualJokeId, index + 1]),
  );

  for (const section of visualJokeSections) {
    const sectionJokes = set.jokes.filter((joke) => joke.section === section);
    const shortfall =
      sectionJokes.length < targetPerSection
        ? `  (showing ${sectionJokes.length} of ${targetPerSection})`
        : "";
    divider(`Section: ${section}${shortfall}`);
    for (const joke of sectionJokes) {
      const rank = topPickRankById.get(joke.id);
      console.log(`  ${joke.order}. ${joke.text}${rank ? `   ** Top pick #${rank}` : ""}`);
    }
  }

  divider("Top Picks (model's self-selected best, in order) — an auto-run takes #1");
  set.topPicks.forEach((pick, index) => {
    const joke = set.jokes.find((candidate) => candidate.id === pick.visualJokeId);
    console.log(`  #${index + 1} [${joke?.section ?? "?"}] ${joke?.text ?? "(unresolved)"}`);
    console.log(`      reason: ${pick.reason}`);
  });
}

// A compact machine-readable summary to paste back for the register review + any
// direction tuning. Carries the resolved model/config, per-section counts, every
// joke, and the resolved Top Picks (with the model's internal reasons).
function printPasteBackBlock(set: VisualJokeSet) {
  const block = {
    config: { baseUrl, model, timeoutMs },
    perSection: Object.fromEntries(
      visualJokeSections.map((section) => [
        section,
        set.jokes.filter((joke) => joke.section === section).length,
      ]),
    ),
    jokes: set.jokes.map((joke) => ({ order: joke.order, section: joke.section, text: joke.text })),
    topPicks: set.topPicks.map((pick) => {
      const joke = set.jokes.find((candidate) => candidate.id === pick.visualJokeId);
      return { reason: pick.reason, section: joke?.section, text: joke?.text };
    }),
  };

  divider("PASTE THIS BLOCK BACK");
  console.log(JSON.stringify(block, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
