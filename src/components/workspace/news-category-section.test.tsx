import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { newsCategories } from "@/services/generation";
import { NewsCategorySection } from "./news-category-section";

function getSection() {
  return screen.getByRole("region", { name: "News category" });
}

describe("NewsCategorySection", () => {
  test("renders the ten vocabulary values as chips", () => {
    render(<NewsCategorySection onNewsCategoryChange={vi.fn()} />);

    const chips = within(getSection()).getAllByRole("button");

    expect(chips).toHaveLength(newsCategories.length);
    for (const category of newsCategories) {
      expect(within(getSection()).getByRole("button", { name: category })).toBeInTheDocument();
    }
  });

  test("pre-selects the chip matching the run's current value", () => {
    render(<NewsCategorySection newsCategory="ACQUIRED" onNewsCategoryChange={vi.fn()} />);

    // The matching chip is the lit one...
    expect(
      within(getSection()).getByRole("button", { name: "ACQUIRED", pressed: true }),
    ).toBeInTheDocument();
    // ...and it is the only one.
    expect(within(getSection()).getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  test("pre-selects VIRAL when the run carries no value", () => {
    render(<NewsCategorySection onNewsCategoryChange={vi.fn()} />);

    expect(
      within(getSection()).getByRole("button", { name: "VIRAL", pressed: true }),
    ).toBeInTheDocument();
    expect(within(getSection()).getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  test("clicking a chip invokes the change with that value", async () => {
    const user = userEvent.setup();
    const onNewsCategoryChange = vi.fn();
    render(
      <NewsCategorySection newsCategory="VIRAL" onNewsCategoryChange={onNewsCategoryChange} />,
    );

    await user.click(within(getSection()).getByRole("button", { name: "LAUNCHED" }));

    expect(onNewsCategoryChange).toHaveBeenCalledExactlyOnceWith("LAUNCHED");
  });

  test("re-picking the already-selected chip is a no-op", async () => {
    const user = userEvent.setup();
    const onNewsCategoryChange = vi.fn();
    render(
      <NewsCategorySection newsCategory="FUNDED" onNewsCategoryChange={onNewsCategoryChange} />,
    );

    await user.click(within(getSection()).getByRole("button", { name: "FUNDED" }));

    expect(onNewsCategoryChange).not.toHaveBeenCalled();
  });
});
