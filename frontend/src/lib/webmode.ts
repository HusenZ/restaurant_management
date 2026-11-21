"use client";

import { useEffect, useState } from "react";
import type { PublicRestaurant } from "./types";

export type WebMode = "takeaway" | "delivery";

export function useWebMode(slug: string, r?: PublicRestaurant): [WebMode, (m: WebMode) => void] {
  const [mode, setModeState] = useState<WebMode>("takeaway");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`dineos:mode:${slug}`) as WebMode | null;
      if (saved === "delivery" && r?.settings.delivery_enabled) setModeState("delivery");
      else if (r && !r.settings.takeaway_enabled && r.settings.delivery_enabled) setModeState("delivery");
    } catch {
      /* ignore */
    }
  }, [slug, r]);
  const setMode = (m: WebMode) => {
    setModeState(m);
    try {
      localStorage.setItem(`dineos:mode:${slug}`, m);
    } catch {
      /* ignore */
    }
  };
  return [mode, setMode];
}
