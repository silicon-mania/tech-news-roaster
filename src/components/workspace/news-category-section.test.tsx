import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { newsCategories } from "@/services/generation";
import { NewsCategorySection } from "./news-category-section";

// The component owns only its chips (the surface supplies the labeled section and
// heading), so these tests query the chips straight off the render.
describe("NewsCategorySection", () => {
  test("renders the ten vocabulary values as chips", () => {
    render(<NewsCategorySection onNewsCategoryChange={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(newsCategories.length);
    for (const category of newsCategories) {
      expect(screen.getByRole("button", { name: category })).toBeInTheDocument();
    }
  });

  test("pre-selects the chip matching the run's current value", () => {
    render(<NewsCategorySection newsCategory="ACQUIRED" onNewsCategoryChange={vi.fn()} />);

    // The matching chip is the lit one...
    expect(screen.getByRole("button", { name: "ACQUIRED", pressed: true })).toBeInTheDocument();
    // ...and it is the only one.
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  test("pre-selects VIRAL when the run carries no value", () => {
    render(<NewsCategorySection onNewsCategoryChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "VIRAL", pressed: true })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  test("clicking a chip invokes the change with that value", async () => {
    const user = userEvent.setup();
    const onNewsCategoryChange = vi.fn();
    render(
      <NewsCategorySection newsCategory="VIRAL" onNewsCategoryChange={onNewsCategoryChange} />,
    );

    await user.click(screen.getByRole("button", { name: "LAUNCHED" }));

    expect(onNewsCategoryChange).toHaveBeenCalledExactlyOnceWith("LAUNCHED");
  });

  test("re-picking the already-selected chip is a no-op", async () => {
    const user = userEvent.setup();
    const onNewsCategoryChange = vi.fn();
    render(
      <NewsCategorySection newsCategory="FUNDED" onNewsCategoryChange={onNewsCategoryChange} />,
    );

    await user.click(screen.getByRole("button", { name: "FUNDED" }));

    expect(onNewsCategoryChange).not.toHaveBeenCalled();
  });
});
