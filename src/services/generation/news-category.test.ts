import { describe, expect, test } from "vitest";
import {
  defaultNewsCategory,
  isNewsCategory,
  type NewsCategory,
  newsCategories,
  resolveNewsCategory,
  resolveNewsCategoryStamp,
} from "@/services/generation";

describe("News Category vocabulary", () => {
  test("is the closed ten-value list with VIRAL as the residual", () => {
    expect(newsCategories).toEqual([
      "LAUNCHED",
      "DROPPED",
      "ACQUIRED",
      "SIGNED",
      "FIRED",
      "RESIGNED",
      "FUNDED",
      "PUBLISHED",
      "DRAMA",
      "VIRAL",
    ]);
    expect(defaultNewsCategory).toBe("VIRAL");
    expect(newsCategories).toContain(defaultNewsCategory);
  });

  test("isNewsCategory recognizes the ten and narrows to NewsCategory", () => {
    for (const value of newsCategories) {
      expect(isNewsCategory(value)).toBe(true);
    }

    const value: string = "ACQUIRED";

    if (!isNewsCategory(value)) {
      throw new Error("expected ACQUIRED to be a News Category");
    }

    // Inside the guard the value narrows to the union, so it assigns cleanly.
    const narrowed: NewsCategory = value;
    expect(newsCategories).toContain(narrowed);
  });

  test("isNewsCategory rejects custom words and is case-sensitive", () => {
    // A custom word and a lowercased value are both treated as custom (they fill
    // the custom field rather than lighting a chip).
    expect(isNewsCategory("BREAKING")).toBe(false);
    expect(isNewsCategory("launched")).toBe(false);
    expect(isNewsCategory("")).toBe(false);
  });

  test("resolveNewsCategory falls back to VIRAL only when the value is absent", () => {
    expect(resolveNewsCategory(undefined)).toBe("VIRAL");
    expect(resolveNewsCategory("ACQUIRED")).toBe("ACQUIRED");
    // A custom word resolves to itself, unchanged.
    expect(resolveNewsCategory("breaking")).toBe("breaking");
  });

  test("resolveNewsCategoryStamp uppercases the resolved value and falls back to VIRAL", () => {
    expect(resolveNewsCategoryStamp(undefined)).toBe("VIRAL");
    expect(resolveNewsCategoryStamp("ACQUIRED")).toBe("ACQUIRED");
    // A lowercase custom word is uppercased to match the LAUNCHED / DROPPED look.
    expect(resolveNewsCategoryStamp("breaking")).toBe("BREAKING");
  });
});
