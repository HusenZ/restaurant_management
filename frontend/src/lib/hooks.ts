"use client";

import { useEffect, useRef, useState } from "react";
import { wsOrigin } from "./api";
import type { RealtimeEvent } from "./types";

/** True after the first client render — gate anything that reads localStorage-backed stores. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/** Re-render every `ms` so timers ("12 min ago") stay fresh. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export type ConnState = "connecting" | "live" | "offline";

/**
 * WebSocket subscription with heartbeat + exponential backoff.
 * path: "/ws/staff?token=..." or "/ws/guest?token=..."; null disables.
 */
export function useRealtime(path: string | null, onEvent: (e: RealtimeEvent) => void): ConnState {
  const [state, setState] = useState<ConnState>("connecting");
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!path) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      setState("connecting");
      ws = new WebSocket(`${wsOrigin()}${path}`);
      ws.onopen = () => {
        attempt = 0;
        setState("live");
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
      };
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as RealtimeEvent;
          if (event.type !== "pong") handler.current(event);
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = (ev) => {
        clearInterval(ping);
        if (closed) return;
        setState("offline");
        if (ev.code === 4401 || ev.code === 4403) return; // bad token — don't hammer
        attempt += 1;
        retry = setTimeout(connect, Math.min(15_000, 500 * 2 ** attempt));
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    const onVisible = () => {
      if (document.visibilityState === "visible" && ws?.readyState !== WebSocket.OPEN) {
        clearTimeout(retry);
        attempt = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      clearInterval(ping);
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
      ws?.close();
    };
  }, [path]);

  return path ? state : "offline";
}

/** Persisted guest tokens (per table QR, order, reservation). */
export const guestTokens = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`dineos:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, token: string) {
    try {
      localStorage.setItem(`dineos:${key}`, token);
    } catch {
      /* private mode */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(`dineos:${key}`);
    } catch {
      /* ignore */
    }
  },
};
