"use client";

import { Form } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SectionHeader({
  title,
  directionLabel,
  directionPanelId,
  isDirectionOpen,
  onToggleDirection,
}: {
  title: string;
  directionLabel?: string;
  directionPanelId?: string;
  isDirectionOpen?: boolean;
  onToggleDirection?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <h1 className="title-serif text-2xl text-foreground md:text-3xl">{title}</h1>
      {directionLabel && onToggleDirection ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-controls={directionPanelId}
                aria-expanded={isDirectionOpen}
                aria-label={`${isDirectionOpen ? "Close" : "Open"} ${directionLabel}`}
                className="shrink-0 text-muted-foreground"
                onClick={onToggleDirection}
                size="icon"
                type="button"
                variant="ghost"
              />
            }>
            <Form aria-hidden className="size-3.5" strokeWidth={1.75} />
          </TooltipTrigger>
          <TooltipContent>{directionLabel}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
