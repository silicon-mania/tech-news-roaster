"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TextRevealModal({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 max-w-none translate-x-0 translate-y-0 rounded-none bg-background/96 p-3 ring-0 backdrop-blur-sm sm:max-w-none sm:p-5">
        <div className="mx-auto grid h-full w-full max-w-3xl grid-rows-[auto_1fr] gap-4 overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-sm">{title}</DialogTitle>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={`Close ${title}`}
                    className="text-muted-foreground"
                    onClick={onClose}
                    size="icon"
                    variant="ghost"
                  />
                }>
                <X aria-hidden className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
          <div className="min-h-0 overflow-y-auto pb-2">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
