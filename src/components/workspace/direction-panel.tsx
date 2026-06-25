"use client";

import type { ReactNode } from "react";

type DirectionPanelProps = {
  id: string;
  title: string;
  isOpen: boolean;
  children: ReactNode;
};

/**
 * Right-side direction panel. Mirrors the runs sidebar UI on the opposite edge,
 * minus the hover-peek: it only opens (and pushes the main content) when its
 * section's form button is clicked, and collapses on the next click. The panel
 * stays mounted so it slides both ways; `inert` keeps the off-screen content out
 * of the tab order and the accessibility tree while closed.
 */
export function DirectionPanel({ id, title, isOpen, children }: DirectionPanelProps) {
  return (
    <aside
      aria-label={title}
      className={`fixed inset-y-0 right-0 z-50 w-[min(20rem,calc(100vw-3rem))] overflow-y-auto bg-popover/95 px-4 pt-16 pb-6 shadow-2xl shadow-black/40 backdrop-blur transition-transform duration-300 ease-out sm:px-5 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
      id={id}
      inert={!isOpen}>
      <div className="grid gap-3">
        <h2 className="display-locked text-foreground text-xl md:text-2xl">{title}</h2>
        {children}
      </div>
    </aside>
  );
}
