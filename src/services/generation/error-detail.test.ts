import { describe, expect, test } from "vitest";
import { describeErrorDetail, summarizeErrorMessage } from "./error-detail";

// Mirrors the real undici shape behind "fetch failed": a TypeError whose `cause`
// is a coded HeadersTimeoutError.
function fetchFailedError() {
  const cause = Object.assign(new Error("Headers Timeout Error"), {
    code: "UND_ERR_HEADERS_TIMEOUT",
  });
  cause.name = "HeadersTimeoutError";

  return new TypeError("fetch failed", { cause });
}

describe("describeErrorDetail", () => {
  test("flattens the error and its cause chain, appending any code", () => {
    expect(describeErrorDetail(fetchFailedError())).toEqual([
      "Error: TypeError: fetch failed",
      "Cause: HeadersTimeoutError: Headers Timeout Error (UND_ERR_HEADERS_TIMEOUT)",
    ]);
  });

  test("handles a plain error with no cause", () => {
    expect(describeErrorDetail(new Error("boom"))).toEqual(["Error: Error: boom"]);
  });

  test("describes a non-error thrown value", () => {
    expect(describeErrorDetail("just a string")).toEqual(["Error: just a string"]);
  });

  test("returns nothing for a nullish value", () => {
    expect(describeErrorDetail(null)).toEqual([]);
    expect(describeErrorDetail(undefined)).toEqual([]);
  });

  test("stops after a bounded cause depth rather than looping forever", () => {
    const looping = new Error("loop");
    (looping as { cause?: unknown }).cause = looping;

    expect(describeErrorDetail(looping).length).toBeLessThanOrEqual(5);
  });
});

describe("summarizeErrorMessage", () => {
  test("reaches into the cause for a code when the top error has none", () => {
    expect(summarizeErrorMessage(fetchFailedError(), "fallback")).toBe(
      "fetch failed (UND_ERR_HEADERS_TIMEOUT)",
    );
  });

  test("appends a top-level code when present", () => {
    const error = Object.assign(new Error("request blew up"), { code: "E_BLEW_UP" });

    expect(summarizeErrorMessage(error, "fallback")).toBe("request blew up (E_BLEW_UP)");
  });

  test("returns the bare message when there is no code", () => {
    expect(summarizeErrorMessage(new Error("nope"), "fallback")).toBe("nope");
  });

  test("falls back for non-errors and empty messages", () => {
    expect(summarizeErrorMessage("not an error", "fallback")).toBe("fallback");
    expect(summarizeErrorMessage(new Error("   "), "fallback")).toBe("fallback");
  });
});
