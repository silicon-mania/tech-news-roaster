import { describe, expect, test } from "vitest";
import {
  isAllowlistedOperatorEmail,
  readOperatorAllowlist,
  readPrimaryOperatorEmail,
} from "./operator-allowlist";

describe("operator allowlist", () => {
  test("admits any email in the set, regardless of case or surrounding space", () => {
    const env = {
      OPERATOR_ALLOWLISTED_EMAILS: "Hugo@Example.com, adil@example.com,gabriel@example.com",
    };

    expect(isAllowlistedOperatorEmail("hugo@example.com", env)).toBe(true);
    expect(isAllowlistedOperatorEmail("  ADIL@EXAMPLE.COM  ", env)).toBe(true);
    expect(isAllowlistedOperatorEmail("gabriel@example.com", env)).toBe(true);
  });

  test("rejects an email outside the set", () => {
    const env = { OPERATOR_ALLOWLISTED_EMAILS: "hugo@example.com, adil@example.com" };

    expect(isAllowlistedOperatorEmail("intruder@example.com", env)).toBe(false);
  });

  test("reads a normalized, de-duplicated, order-preserving set", () => {
    const env = {
      OPERATOR_ALLOWLISTED_EMAILS: " Hugo@Example.com , adil@example.com, HUGO@example.com ,, ",
    };

    // Trimmed + lower-cased, blanks dropped, the repeated Hugo collapsed once.
    expect([...readOperatorAllowlist(env)]).toEqual(["hugo@example.com", "adil@example.com"]);
  });

  test("allows nobody when the allowlist is unset or empty", () => {
    expect(readOperatorAllowlist({}).size).toBe(0);
    expect(readOperatorAllowlist({ OPERATOR_ALLOWLISTED_EMAILS: "   ,  , " }).size).toBe(0);
    expect(isAllowlistedOperatorEmail("hugo@example.com", {})).toBe(false);
  });

  describe("primary operator", () => {
    test("resolves to the first allowlist entry, normalized", () => {
      const env = { OPERATOR_ALLOWLISTED_EMAILS: " Hugo@Example.com , adil@example.com" };

      expect(readPrimaryOperatorEmail(env)).toBe("hugo@example.com");
    });

    test("is unaffected by a single trailing duplicate or blank entry", () => {
      const env = { OPERATOR_ALLOWLISTED_EMAILS: "hugo@example.com" };

      expect(readPrimaryOperatorEmail(env)).toBe("hugo@example.com");
    });

    test("is null when the allowlist is empty", () => {
      expect(readPrimaryOperatorEmail({})).toBeNull();
      expect(readPrimaryOperatorEmail({ OPERATOR_ALLOWLISTED_EMAILS: "  " })).toBeNull();
    });
  });
});
