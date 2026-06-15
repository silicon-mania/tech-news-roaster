import { describe, expect, test } from "vitest";
import { isAllowlistedOperatorEmail, readOperatorAllowlistedEmail } from "./operator-allowlist";

describe("operator allowlist", () => {
  test("admits the configured operator email regardless of case or surrounding space", () => {
    const env = { OPERATOR_ALLOWLISTED_EMAIL: "Operator@Example.com" };

    expect(isAllowlistedOperatorEmail("operator@example.com", env)).toBe(true);
    expect(isAllowlistedOperatorEmail("  OPERATOR@EXAMPLE.COM  ", env)).toBe(true);
  });

  test("rejects every other email", () => {
    const env = { OPERATOR_ALLOWLISTED_EMAIL: "operator@example.com" };

    expect(isAllowlistedOperatorEmail("intruder@example.com", env)).toBe(false);
  });

  test("allows nobody when the allowlist is unconfigured", () => {
    expect(isAllowlistedOperatorEmail("operator@example.com", {})).toBe(false);
    expect(readOperatorAllowlistedEmail({})).toBeNull();
    expect(readOperatorAllowlistedEmail({ OPERATOR_ALLOWLISTED_EMAIL: "   " })).toBeNull();
  });

  test("normalizes the configured email", () => {
    expect(readOperatorAllowlistedEmail({ OPERATOR_ALLOWLISTED_EMAIL: " Op@Example.COM " })).toBe(
      "op@example.com",
    );
  });
});
