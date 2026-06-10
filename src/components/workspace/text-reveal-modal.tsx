"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

export function TextRevealModal({
  children,
  label,
  onClose,
  title,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", closeOnEscape);

    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      aria-label={label}
      aria-modal="true"
      className="fixed inset-0 z-50 grid bg-slate-950/96 p-3 text-slate-100 backdrop-blur-sm sm:p-5"
      role="dialog">
      <div className="mx-auto grid h-full w-full max-w-3xl grid-rows-[auto_1fr] gap-4 overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-sm">{title}</p>
          <button
            type="button"
            aria-label={`Close ${label}`}
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-slate-900/80 text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto pb-2">{children}</div>
      </div>
    </div>
  );
}
