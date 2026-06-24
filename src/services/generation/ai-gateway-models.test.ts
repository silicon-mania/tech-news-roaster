import { describe, expect, test } from "vitest";
import { readAiGatewayApiKey } from "./ai-gateway-models";

describe("readAiGatewayApiKey", () => {
  describe("manual runs (the Workspace default)", () => {
    test("uses AI_GATEWAY_API_KEY", () => {
      expect(readAiGatewayApiKey({ AI_GATEWAY_API_KEY: "manual-key" })).toBe("manual-key");
    });

    test("defaults to manual when no run kind is passed", () => {
      // The pipeline call sites omit the argument on the manual path; the default
      // must resolve the manual key, never the capped automated key.
      expect(readAiGatewayApiKey({ AI_GATEWAY_API_KEY: "manual-key" })).toBe(
        readAiGatewayApiKey({ AI_GATEWAY_API_KEY: "manual-key" }, "manual"),
      );
    });

    test("ignores the automated key — its $5/day cap must not throttle Workspace users", () => {
      expect(
        readAiGatewayApiKey({ AI_GATEWAY_AUTOMATED_API_KEY: "capped-key" }, "manual"),
      ).toBeUndefined();
    });
  });

  describe("automated runs (the cron / Discovery Sweep)", () => {
    test("uses AI_GATEWAY_AUTOMATED_API_KEY", () => {
      expect(readAiGatewayApiKey({ AI_GATEWAY_AUTOMATED_API_KEY: "capped-key" }, "automated")).toBe(
        "capped-key",
      );
    });

    test("does NOT fall back to the manual key — once capped, the cron must stop, not spill over", () => {
      expect(
        readAiGatewayApiKey({ AI_GATEWAY_API_KEY: "manual-key" }, "automated"),
      ).toBeUndefined();
    });
  });

  describe("absent and blank credentials", () => {
    test("returns undefined when the relevant key is unset", () => {
      expect(readAiGatewayApiKey({}, "manual")).toBeUndefined();
      expect(readAiGatewayApiKey({}, "automated")).toBeUndefined();
    });

    test("treats a whitespace-only value as unset", () => {
      expect(readAiGatewayApiKey({ AI_GATEWAY_API_KEY: "   " }, "manual")).toBeUndefined();
      expect(
        readAiGatewayApiKey({ AI_GATEWAY_AUTOMATED_API_KEY: "   " }, "automated"),
      ).toBeUndefined();
    });
  });
});
