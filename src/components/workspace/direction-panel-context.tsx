"use client";

import { createContext, useContext } from "react";

export type DirectionPanelContextValue = {
  /** The id of the currently open direction panel, or null when none is open. */
  openPanelId: string | null;
  /** Open the given panel, or close it when it is already the open one. */
  togglePanel: (panelId: string) => void;
  /** Close whichever panel is open. */
  closePanel: () => void;
};

export const DirectionPanelContext = createContext<DirectionPanelContextValue | null>(null);

export function useDirectionPanel(): DirectionPanelContextValue {
  const value = useContext(DirectionPanelContext);

  if (!value) {
    throw new Error("useDirectionPanel must be used within a DirectionPanelContext provider");
  }

  return value;
}
