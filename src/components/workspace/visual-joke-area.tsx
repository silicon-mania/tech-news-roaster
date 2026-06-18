"use client";

import type { VisualJokeSet } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { DirectionPanel } from "./direction-panel";
import { useDirectionPanel } from "./direction-panel-context";
import { SectionHeader } from "./section-header";
import { VisualJokeList } from "./visual-joke-list";

export function VisualJokeArea({
  run,
  visualJokeSet,
  onSelectedVisualJokeChange,
  onVisualJokeTitleChange,
}: {
  run: GenerationRun;
  visualJokeSet: VisualJokeSet;
  onSelectedVisualJokeChange: (runId: string, visualJokeId: string | null) => void;
  onVisualJokeTitleChange: (runId: string, visualJokeId: string, title: string) => void;
}) {
  const { openPanelId, togglePanel } = useDirectionPanel();
  const panelId = "visual-joke-direction";
  const isDirectionOpen = openPanelId === panelId;
  const hasVisualJokeDirection = Boolean(run.visualJokeDirection?.trim());

  return (
    <>
      <SectionHeader
        directionLabel="Visual joke direction"
        directionPanelId={panelId}
        isDirectionOpen={isDirectionOpen}
        onToggleDirection={hasVisualJokeDirection ? () => togglePanel(panelId) : undefined}
        title="Visual jokes"
      />
      <VisualJokeList
        onSelectedVisualJokeChange={(visualJokeId) =>
          onSelectedVisualJokeChange(run.id, visualJokeId)
        }
        onVisualJokeTitleChange={(visualJokeId, title) =>
          onVisualJokeTitleChange(run.id, visualJokeId, title)
        }
        selectedVisualJokeId={run.selectedVisualJoke?.visualJokeId ?? null}
        visualJokeSet={visualJokeSet}
      />
      {hasVisualJokeDirection ? (
        <DirectionPanel id={panelId} isOpen={isDirectionOpen} title="Visual joke direction">
          <pre className="whitespace-pre-wrap break-words rounded-md bg-card p-3 text-foreground/90 text-sm leading-6">
            {run.visualJokeDirection}
          </pre>
        </DirectionPanel>
      ) : null}
    </>
  );
}
