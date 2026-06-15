"use client";

import type { ReactNode } from "react";
import { DirectionPanel } from "./direction-panel";
import { useDirectionPanel } from "./direction-panel-context";
import { SectionHeader } from "./section-header";

/**
 * The text-generation prompt is the optional "User's Direction" typed into the run
 * form before the run starts. By the time the drafts (and this section) exist, the
 * run has already started, so the direction panel here is always read-only — it
 * records the direction that was used, it never edits it.
 */
export function TextGenerationSection({
  usersDirection,
  children,
}: {
  usersDirection: string;
  children: ReactNode;
}) {
  const { openPanelId, togglePanel } = useDirectionPanel();
  const panelId = "text-direction";
  const isDirectionOpen = openPanelId === panelId;
  const trimmedDirection = usersDirection.trim();

  return (
    <div className="grid min-w-0 gap-3">
      <SectionHeader
        directionLabel="Text direction"
        directionPanelId={panelId}
        isDirectionOpen={isDirectionOpen}
        onToggleDirection={() => togglePanel(panelId)}
        title="Text generation"
      />
      {children}
      <DirectionPanel id={panelId} isOpen={isDirectionOpen} title="Text direction">
        {trimmedDirection ? (
          <pre className="whitespace-pre-wrap break-words rounded-md bg-card p-3 text-foreground/90 text-sm leading-6">
            {usersDirection}
          </pre>
        ) : (
          <p className="text-muted-foreground text-sm leading-6">
            No direction was provided for this run.
          </p>
        )}
      </DirectionPanel>
    </div>
  );
}
