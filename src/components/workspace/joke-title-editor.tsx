"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type JokeTitleEditorProps = {
  /** The current Joke Title — the Visual Joke's text. */
  value: string;
  /** Emits the overwritten Joke Title live as the operator rewrites it. */
  onValueChange: (value: string) => void;
  /**
   * Accessible name for the joke (e.g. "Satire visual joke 1"). The editor
   * derives "Edit {label}" for both the read trigger and the textarea so each
   * joke stays distinguishable to assistive tech and tests.
   */
  label: string;
  /** Type styling shared by the read view and the textarea so each surface keeps its own scale. */
  textClassName?: string;
};

/**
 * A single reusable inline editor for a Visual Joke's Joke Title. Click the title
 * to edit it in place; every keystroke emits the overwritten title (no save
 * button — persistence rides the caller's autosave path) and the read view re-
 * renders from the controlled value. Built once so the Workspace's visual-joke
 * area and the Selected Run sidebar inherit identical behavior.
 */
export function JokeTitleEditor({
  value,
  onValueChange,
  label,
  textClassName,
}: JokeTitleEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const editLabel = `Edit ${label}`;

  if (isEditing) {
    return (
      <Textarea
        aria-label={editLabel}
        autoFocus
        className={cn(
          "min-h-0 resize-y whitespace-pre-wrap break-words rounded-md border-transparent bg-transparent px-2 py-1 text-foreground focus-visible:border-border focus-visible:ring-ring/20 dark:bg-transparent",
          textClassName,
        )}
        onBlur={() => setIsEditing(false)}
        onChange={(event) => onValueChange(event.target.value)}
        value={value}
      />
    );
  }

  return (
    <button
      aria-label={editLabel}
      className={cn(
        "w-full whitespace-pre-wrap break-words rounded-md px-2 py-1 text-left text-foreground outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40",
        textClassName,
      )}
      onClick={() => setIsEditing(true)}
      type="button">
      {value}
    </button>
  );
}
