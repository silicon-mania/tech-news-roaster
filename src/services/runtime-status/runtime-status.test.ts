import { describe, expect, test } from "vitest";
import { isDiscoverySweepReady, type RuntimeStatus } from "./runtime-status";

function buildStatus({
  retrievalLive = true,
  persistenceLive = true,
  imageModelAvailable = true,
  visualJokeModelAvailable = true,
}: {
  retrievalLive?: boolean;
  persistenceLive?: boolean;
  imageModelAvailable?: boolean;
  visualJokeModelAvailable?: boolean;
} = {}): RuntimeStatus {
  return {
    enrichment: { credentials: { apiKey: true }, mode: "configured" },
    generation: {
      aiGateway: {
        catalogReachable: true,
        imageModel: { available: imageModelAvailable, id: "google/gemini-2.5-flash-image" },
        models: {
          openai: { available: true, id: "openai/gpt-5.4-mini" },
          anthropic: { available: true, id: "anthropic/claude-sonnet-4.6" },
          google: { available: true, id: "google/gemini-3-flash" },
        },
        visualJokeModel: { available: visualJokeModelAvailable, id: "openai/gpt-5.4-mini" },
      },
      credentials: { aiGatewayApiKey: true },
      mode: "live",
    },
    persistence: {
      credentials: {
        operatorAllowlistedEmail: persistenceLive,
        supabaseAnonKey: persistenceLive,
        supabaseServiceRoleKey: persistenceLive,
        supabaseUrl: persistenceLive,
      },
      mode: persistenceLive ? "live" : "off",
    },
    productionCredentials: { aiGatewayApiKey: true, twitterApiIoApiKey: true },
    productionReady: true,
    retrieval: {
      credentials: { twitterApiIoApiKey: retrievalLive },
      mode: retrievalLive ? "live" : "fixture",
    },
  };
}

describe("isDiscoverySweepReady", () => {
  test("is ready when retrieval, Supabase, and the image and visual-joke models are all live", () => {
    expect(isDiscoverySweepReady(buildStatus())).toBe(true);
  });

  test("is not ready when followed-accounts retrieval is only a fixture", () => {
    expect(isDiscoverySweepReady(buildStatus({ retrievalLive: false }))).toBe(false);
  });

  test("is not ready when Supabase persistence is off", () => {
    expect(isDiscoverySweepReady(buildStatus({ persistenceLive: false }))).toBe(false);
  });

  test("is not ready when the image model is unavailable", () => {
    expect(isDiscoverySweepReady(buildStatus({ imageModelAvailable: false }))).toBe(false);
  });

  test("is not ready when the Visual Joke model is unavailable", () => {
    expect(isDiscoverySweepReady(buildStatus({ visualJokeModelAvailable: false }))).toBe(false);
  });
});
