"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type PanelOverlayProps = {
  children: ReactNode;
  label: string;
  side: "left" | "right";
  onClose: () => void;
};

export function PanelOverlay({ children, label, onClose, side }: PanelOverlayProps) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}>
      <SheetContent
        aria-label={label}
        side={side}
        showCloseButton={false}
        className="gap-0 overflow-y-auto bg-background/96 p-4 backdrop-blur sm:p-6 data-[side=left]:w-[min(26rem,100vw)] data-[side=left]:sm:w-[min(26rem,calc(100vw-2rem))] data-[side=left]:sm:max-w-none data-[side=right]:w-[min(26rem,100vw)] data-[side=right]:sm:w-[min(26rem,calc(100vw-2rem))] data-[side=right]:sm:max-w-none">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`Close ${label.toLowerCase()}`}
                className="mb-5 ml-auto text-muted-foreground"
                onClick={onClose}
                size="icon"
                variant="ghost"
              />
            }>
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </TooltipTrigger>
          <TooltipContent>Close</TooltipContent>
        </Tooltip>
        {children}
      </SheetContent>
    </Sheet>
  );
}
