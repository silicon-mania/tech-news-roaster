import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { newsCategories } from "@/services/generation";
import { NewsCategorySectionSkeleton } from "./news-category-section-skeleton";

describe("NewsCategorySectionSkeleton", () => {
  test("renders one chip placeholder per vocabulary value plus the field bar", () => {
    const { container } = render(<NewsCategorySectionSkeleton />);

    // One placeholder per chip so the loaded footprint matches, plus the custom
    // field bar beneath them — every node is a pulsing skeleton.
    const placeholders = container.querySelectorAll('[data-slot="skeleton"]');

    expect(placeholders).toHaveLength(newsCategories.length + 1);
  });

  test("is decorative — no interactive chips while loading", () => {
    render(<NewsCategorySectionSkeleton />);

    // The skeleton stands in for the chips but exposes none of them: the run can't
    // be edited until the classifier result lands on completion.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
