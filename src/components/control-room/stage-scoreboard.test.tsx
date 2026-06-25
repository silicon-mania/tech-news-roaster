import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { GenerationRun } from "@/services/workspace";
import { deriveStageScoreboard, StageScoreboard } from "./stage-scoreboard";

type StageStatus = "not-started" | "running" | "completed" | "failed";

// The scoreboard reads only phase/status/per-stage result states, so a minimal
// run with those fields is enough to exercise it.
function buildRun(opts: {
  status?: GenerationRun["status"];
  phase?: GenerationRun["phase"];
  enrichment?: StageStatus;
  text?: StageStatus;
  image?: StageStatus;
}): GenerationRun {
  const {
    status = "running",
    phase = "enrichment-running",
    enrichment = "running",
    text = "not-started",
    image = "not-started",
  } = opts;

  return {
    status,
    phase,
    generationResultStates: {
      contextGathering: { status: enrichment },
      textGeneration: { status: text },
      imageGeneration: { status: image },
      newsLinkedImageDiscovery: { status: "not-started" },
    },
  } as unknown as GenerationRun;
}

describe("deriveStageScoreboard", () => {
  test("returns null for a null run and a run with no result states", () => {
    expect(deriveStageScoreboard(null)).toBeNull();
    expect(
      deriveStageScoreboard({ status: "running", phase: "enrichment-running" } as GenerationRun),
    ).toBeNull();
  });

  test("maps an in-flight run's stages from its per-stage states", () => {
    const segments = deriveStageScoreboard(
      buildRun({ phase: "text-generation-running", enrichment: "completed", text: "running" }),
    );

    expect(segments?.map((segment) => segment.state)).toEqual(["complete", "running", "pending"]);
  });

  test("shows a failed stage even when the run has settled (not in-flight)", () => {
    const segments = deriveStageScoreboard(
      buildRun({
        status: "failed",
        phase: "image-generation-failed",
        enrichment: "completed",
        text: "completed",
        image: "failed",
      }),
    );

    expect(segments?.map((segment) => segment.state)).toEqual(["complete", "complete", "failed"]);
  });

  test("returns null for a settled complete run (no lingering scoreboard)", () => {
    expect(
      deriveStageScoreboard(
        buildRun({
          status: "completed",
          phase: "image-generation-complete",
          enrichment: "completed",
          text: "completed",
          image: "completed",
        }),
      ),
    ).toBeNull();
  });
});

describe("StageScoreboard", () => {
  test("renders the three-stage pipeline for a live run", () => {
    render(
      <StageScoreboard
        run={buildRun({
          phase: "text-generation-running",
          enrichment: "completed",
          text: "running",
        })}
      />,
    );

    const board = screen.getByRole("group", { name: "Generation pipeline" });
    expect(board).toHaveTextContent("Enrichment");
    expect(board).toHaveTextContent("Text");
    expect(board).toHaveTextContent("Image");
  });

  test("renders nothing for a settled complete run", () => {
    const { container } = render(
      <StageScoreboard
        run={buildRun({
          status: "completed",
          phase: "image-generation-complete",
          enrichment: "completed",
          text: "completed",
          image: "completed",
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
