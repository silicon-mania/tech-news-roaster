import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createDefaultNewsworthinessJudge,
  createLocalNewsworthinessJudge,
  defaultNewsworthinessInstruction,
  type NewsworthinessSubject,
} from "./newsworthiness-filter";

function subject(
  overrides: Partial<NewsworthinessSubject> & { text: string },
): NewsworthinessSubject {
  return { hasMedia: false, ...overrides };
}

describe("local newsworthiness judge", () => {
  const judge = createLocalNewsworthinessJudge();

  test("keeps a clear tech-news tweet", async () => {
    const verdict = await judge.judge(
      subject({ text: "OpenAI launches GPT-5.4 with a new realtime agents API for developers." }),
    );

    expect(verdict.newsworthy).toBe(true);
  });

  test("rejects an off-topic meme tweet", async () => {
    const verdict = await judge.judge(
      subject({ text: "lmaooo this is the funniest meme I have seen all week 💀💀 who made it" }),
    );

    expect(verdict.newsworthy).toBe(false);
  });

  test("rejects an off-topic personal-drama tweet", async () => {
    const verdict = await judge.judge(
      subject({ text: "cannot believe my ex showed up to brunch, the drama was unreal 😭" }),
    );

    expect(verdict.newsworthy).toBe(false);
  });

  test("keeps borderline tech news even when it carries noise words", async () => {
    // "drama" is a noise marker, but the tech signals ("startup", "founders", "ai")
    // are present, so the permissive filter keeps it rather than dropping real news.
    const verdict = await judge.judge(
      subject({
        text: "the drama at the AI startup is wild — founders fighting over the cap table",
      }),
    );

    expect(verdict.newsworthy).toBe(true);
  });

  test("keeps a neutral tweet that is neither noise nor obviously tech (recall over precision)", async () => {
    const verdict = await judge.judge(subject({ text: "the conference hall was packed today" }));

    expect(verdict.newsworthy).toBe(true);
  });
});

describe("AI-gateway newsworthiness judge (vendor boundary)", () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.AI_GATEWAY_API_KEY;
  const previousModel = process.env.AI_GATEWAY_NEWSWORTHINESS_MODEL;

  afterEach(() => {
    globalThis.fetch = previousFetch;
    restoreEnvValue("AI_GATEWAY_API_KEY", previousApiKey);
    restoreEnvValue("AI_GATEWAY_NEWSWORTHINESS_MODEL", previousModel);
  });

  test("parses a 'newsworthy' verdict from a normalized gateway response and sends the default instruction", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      gatewayResponse({ newsworthy: true, reason: "Funding round." }),
    );
    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_NEWSWORTHINESS_MODEL = "openai/newsworthiness-model";
    globalThis.fetch = fetcher;

    const judge = createDefaultNewsworthinessJudge(process.env);
    const verdict = await judge.judge(subject({ text: "Acme raises a $40M Series B." }));

    expect(judge.provider).toBe("ai-gateway");
    expect(verdict).toEqual({ newsworthy: true, reason: "Funding round." });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      messages?: Array<{ content?: string; role?: string }>;
      model?: string;
    };
    expect(body.model).toBe("openai/newsworthiness-model");
    expect(body.messages?.find((message) => message.role === "system")?.content).toBe(
      defaultNewsworthinessInstruction,
    );
  });

  test("parses an 'off-topic' verdict from a normalized gateway response", async () => {
    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    globalThis.fetch = vi.fn<typeof fetch>(async () =>
      gatewayResponse({ newsworthy: false, reason: "Personal drama, not news." }),
    );

    const judge = createDefaultNewsworthinessJudge(process.env);
    const verdict = await judge.judge(subject({ text: "my ex is at brunch again" }));

    expect(verdict).toEqual({ newsworthy: false, reason: "Personal drama, not news." });
  });

  test("tolerates a fenced JSON verdict in the gateway content", async () => {
    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    globalThis.fetch = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: '```json\n{"newsworthy": true, "reason": "Model release."}\n```',
            },
          },
        ],
      }),
    );

    const judge = createDefaultNewsworthinessJudge(process.env);
    const verdict = await judge.judge(subject({ text: "New open-source model dropped." }));

    expect(verdict.newsworthy).toBe(true);
  });
});

describe("newsworthiness AI Gateway credential (automated-only)", () => {
  test("reads the spend-capped automated key", () => {
    // The filter runs only in the unattended cron, so it bills the automated key.
    // With only that key set it must still resolve a gateway judge — had it stayed
    // on the manual resolver, this would fall back to the local heuristic.
    const judge = createDefaultNewsworthinessJudge({
      AI_GATEWAY_AUTOMATED_API_KEY: "capped-key",
    });

    expect(judge.provider).toBe("ai-gateway");
  });

  test("falls back to the shared key when the automated key is unset", () => {
    const judge = createDefaultNewsworthinessJudge({ AI_GATEWAY_API_KEY: "gateway-secret" });

    expect(judge.provider).toBe("ai-gateway");
  });
});

function gatewayResponse(verdict: { newsworthy: boolean; reason: string }) {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(verdict) } }],
  });
}

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
