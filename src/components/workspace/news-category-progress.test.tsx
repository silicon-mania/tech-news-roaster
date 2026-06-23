import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { NewsCategoryProgress } from "./news-category-progress";
import { buildCompletedRun } from "./workspace-test-utils";

describe("NewsCategoryProgress", () => {
  test("shows the News Category step running while the run is in flight", () => {
    render(<NewsCategoryProgress run={buildCompletedRun({ status: "running" })} />);

    const line = screen.getByLabelText(/news category selecting/i);

    expect(line).toBeInTheDocument();
    expect(line).toHaveAttribute("aria-busy", "true");
    expect(line).toHaveTextContent(/news category/i);
  });

  test("renders nothing once the run has settled", () => {
    const { container } = render(
      <NewsCategoryProgress run={buildCompletedRun({ status: "completed" })} />,
    );

    expect(screen.queryByLabelText(/news category selecting/i)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
