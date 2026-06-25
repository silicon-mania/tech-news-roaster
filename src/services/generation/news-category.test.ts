import { describe, expect, test } from "vitest";
import {
  categoryBandColors,
  defaultNewsCategory,
  isNewsCategory,
  type NewsCategory,
  newsCategories,
  resolveBandColor,
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

describe("News Category Color", () => {
  test("maps the ten categories onto the six LOCKED IN signal colors (ADR-0030)", () => {
    for (const category of newsCategories) {
      expect(categoryBandColors[category]).toMatch(/^#[0-9a-f]{6}$/i);
    }

    // Color is a signal, not a unique key: ten categories share six signal hues,
    // and the category word disambiguates (the Run Card prints it beside the
    // stripe; the composite stamps it on the band).
    const distinct = new Set(newsCategories.map((category) => categoryBandColors[category]));
    expect(distinct.size).toBe(6);

    // The semantic groupings that deliberately share a hue.
    expect(categoryBandColors.LAUNCHED).toBe(categoryBandColors.DROPPED);
    expect(categoryBandColors.SIGNED).toBe(categoryBandColors.FIRED);
    expect(categoryBandColors.FIRED).toBe(categoryBandColors.RESIGNED);
    expect(categoryBandColors.DRAMA).toBe(categoryBandColors.VIRAL);
  });

  test("resolveBandColor reads a preset stamp in its own category color", () => {
    for (const category of newsCategories) {
      expect(resolveBandColor(category)).toBe(categoryBandColors[category]);
    }
  });

  test("resolveBandColor reads a custom word in its picked newsCategoryColor", () => {
    expect(resolveBandColor("BREAKING", "FUNDED")).toBe(categoryBandColors.FUNDED);
    expect(resolveBandColor("ai bubble", "DRAMA")).toBe(categoryBandColors.DRAMA);
  });

  test("resolveBandColor falls back to the VIRAL color for a custom word with no color", () => {
    expect(resolveBandColor("BREAKING")).toBe(categoryBandColors.VIRAL);
    // An absent stamp (pre-feature run, or a classification that failed to VIRAL)
    // also resolves to the VIRAL color.
    expect(resolveBandColor(undefined)).toBe(categoryBandColors.VIRAL);
    expect(resolveBandColor("VIRAL")).toBe(categoryBandColors.VIRAL);
  });

  test("the custom-word color is unaffected by the label's casing", () => {
    // A custom word is matched case-sensitively (it is never a preset), and its
    // band reads from newsCategoryColor regardless of how the label is cased.
    expect(resolveBandColor("Breaking News", "SIGNED")).toBe(categoryBandColors.SIGNED);
    expect(resolveBandColor("BREAKING NEWS", "SIGNED")).toBe(categoryBandColors.SIGNED);
    expect(resolveBandColor("breaking news", "SIGNED")).toBe(categoryBandColors.SIGNED);
    // A lowercased vocabulary word is a custom word, so it bands VIRAL, not LAUNCHED.
    expect(resolveBandColor("launched")).toBe(categoryBandColors.VIRAL);
  });

  test("categoryBandColors is keyed by exactly the ten-value vocabulary", () => {
    // The map mirrors the vocabulary tuple one-to-one — no extra keys, no missing
    // ones — so band color is the only per-category dimension (the label text is a
    // single white constant, asserted in template.test.ts).
    expect(Object.keys(categoryBandColors)).toEqual([...newsCategories]);
  });
});
