import { describe, expect, test } from "vitest";
import { readAiGatewayApiKey } from "./ai-gateway-models";

describe("readAiGatewayApiKey", () => {
  describe("manual runs (the Workspace default)", () => {
    test("uses AI_GATEWAY_API_KEY", () => {
      expect(readAiGatewayApiKey({ AI_GATEWAY_API_KEY: "manual-key" })).toBe("manual-key");
    });

    test("defaults to manual when no run kind is passed", () => {
      // The five pipeline call sites omit the argument on the manual path; the
      // default must resolve the shared key, never the capped automated key.
      expect(readAiGatewayApiKey({ AI_GATEWAY_API_KEY: "manual-key" })).toBe(
        readAiGatewayApiKey({ AI_GATEWAY_API_KEY: "manual-key" }, "manual"),
      );
    });

    test("falls back to VERCEL_AI_GATEWAY_API_KEY when AI_GATEWAY_API_KEY is unset", () => {
      expect(readAiGatewayApiKey({ VERCEL_AI_GATEWAY_API_KEY: "vercel-key" }, "manual")).toBe(
        "vercel-key",
      );
    });

    test("prefers AI_GATEWAY_API_KEY over VERCEL_AI_GATEWAY_API_KEY", () => {
      expect(
        readAiGatewayApiKey(
          { AI_GATEWAY_API_KEY: "manual-key", VERCEL_AI_GATEWAY_API_KEY: "vercel-key" },
          "manual",
        ),
      ).toBe("manual-key");
    });

    test("never reads the automated key — a $5/day cap on it must not throttle Workspace users", () => {
      expect(
        readAiGatewayApiKey(
          { AI_GATEWAY_AUTOMATED_API_KEY: "capped-key", AI_GATEWAY_API_KEY: "manual-key" },
          "manual",
        ),
      ).toBe("manual-key");
    });
  });

  describe("automated runs (the cron / Discovery Sweep)", () => {
    test("prefers AI_GATEWAY_AUTOMATED_API_KEY", () => {
      expect(
        readAiGatewayApiKey(
          { AI_GATEWAY_AUTOMATED_API_KEY: "capped-key", AI_GATEWAY_API_KEY: "manual-key" },
          "automated",
        ),
      ).toBe("capped-key");
    });

    test("falls back to the shared key when the automated key is unset (pre-split behavior)", () => {
      expect(readAiGatewayApiKey({ AI_GATEWAY_API_KEY: "manual-key" }, "automated")).toBe(
        "manual-key",
      );
    });

    test("falls back through to VERCEL_AI_GATEWAY_API_KEY when only it is set", () => {
      expect(readAiGatewayApiKey({ VERCEL_AI_GATEWAY_API_KEY: "vercel-key" }, "automated")).toBe(
        "vercel-key",
      );
    });
  });

  describe("absent and blank credentials", () => {
    test("returns undefined when nothing is configured", () => {
      expect(readAiGatewayApiKey({}, "manual")).toBeUndefined();
      expect(readAiGatewayApiKey({}, "automated")).toBeUndefined();
    });

    test("treats whitespace-only values as unset", () => {
      expect(
        readAiGatewayApiKey(
          { AI_GATEWAY_AUTOMATED_API_KEY: "   ", AI_GATEWAY_API_KEY: "manual-key" },
          "automated",
        ),
      ).toBe("manual-key");
    });
  });
});
