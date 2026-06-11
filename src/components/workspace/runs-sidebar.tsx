"use client";

import { PanelLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GenerationRun } from "@/services/workspace";
import { RunsList } from "./runs-list";

type RunsSidebarProps = {
  activeRunId: string | null;
  isPinned: boolean;
  runs: GenerationRun[];
  onDeleteRun: (runId: string) => void;
  onSelectRun: (runId: string) => void;
  onTogglePinned: () => void;
};

/**
 * Notion-style runs sidebar. A top-left icon triggers a hover-peek that floats
 * the panel over the content; clicking the icon pins the panel open so it stays
 * regardless of pointer position (and the main content shifts to make room —
 * the push is handled by the parent). Hover state stays true while the pointer
 * is over either the trigger or the panel, since both live inside one wrapper.
 */
export function RunsSidebar({
  activeRunId,
  isPinned,
  runs,
  onDeleteRun,
  onSelectRun,
  onTogglePinned,
}: RunsSidebarProps) {
  const [isPeeking, setIsPeeking] = useState(false);
  const isOpen = isPinned || isPeeking;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover-peek is a non-essential pointer affordance; the pin button is the keyboard-accessible control.
    <div onMouseEnter={() => setIsPeeking(true)} onMouseLeave={() => setIsPeeking(false)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-controls="runs-sidebar-panel"
              aria-expanded={isOpen}
              aria-label={isPinned ? "Collapse runs" : `Open runs, ${runs.length} saved`}
              className="fixed top-4 left-4 z-50 text-muted-foreground"
              onClick={onTogglePinned}
              size="icon"
              type="button"
              variant="ghost"
            />
          }>
          <PanelLeft aria-hidden className="size-4" strokeWidth={1.75} />
        </TooltipTrigger>
        <TooltipContent side="right">{isPinned ? "Collapse runs" : "Runs"}</TooltipContent>
      </Tooltip>

      <aside
        id="runs-sidebar-panel"
        aria-label="Runs"
        inert={!isOpen}
        className={`fixed inset-y-0 left-0 z-40 w-[min(18rem,calc(100vw-3rem))] overflow-y-auto bg-popover/95 px-4 pt-16 pb-6 shadow-2xl shadow-black/40 backdrop-blur transition-transform duration-300 ease-out sm:px-5 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}>
        <RunsList
          activeRunId={activeRunId}
          runs={runs}
          onDeleteRun={onDeleteRun}
          onSelectRun={onSelectRun}
        />
      </aside>
    </div>
  );
}
