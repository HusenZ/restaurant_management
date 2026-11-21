"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Toaster } from "sonner";
import { cn } from "@/lib/format";
import { THEME_KEY } from "@/lib/theme-script";

export type ThemePref = "light" | "dark" | "system";
function readPref(): ThemePref {
  try {
    return (localStorage.getItem(THEME_KEY) as ThemePref) || "system";
  } catch {
    return "system";
  }
}

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function applyTheme(pref: ThemePref, animate = true) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 260);
  }
  root.setAttribute("data-theme", resolve(pref));
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* private mode */
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readPref() === "system") {
      document.documentElement.setAttribute("data-theme", resolve("system"));
      cb();
    }
  };
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onSystem);
    observer.disconnect();
  };
}

/** Current resolved theme ("light" | "dark"); "light" during SSR. */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"),
    () => "light",
  );
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as ThemePref);
  return [pref, (p) => applyTheme(p)];
}

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Compact icon button that cycles light → dark → system. */
export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useThemePref();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = OPTIONS.find((o) => o.value === pref) ?? OPTIONS[2];
  const next = OPTIONS[(OPTIONS.indexOf(current) + 1) % OPTIONS.length];
  const Icon = mounted ? current.icon : Monitor;
  return (
    <button
      type="button"
      onClick={() => setPref(next.value)}
      className={cn("inline-flex size-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-3 hover:text-fg", className)}
      aria-label={`Theme: ${mounted ? current.label : "System"}. Switch to ${next.label}`}
      title={`Theme: ${mounted ? current.label : "System"} (click for ${next.label})`}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}

/** Three-way segmented switch for settings pages. */
export function ThemeSwitch() {
  const [pref, setPref] = useThemePref();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="inline-flex rounded-xl bg-surface-3 p-1 dark:bg-surface-2" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => {
        const active = mounted && pref === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => setPref(o.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              active ? "bg-surface text-fg shadow-sm dark:bg-surface-3" : "text-muted hover:text-fg",
            )}
          >
            <o.icon className="size-4" /> {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ThemedToaster() {
  const theme = useResolvedTheme();
  return <Toaster theme={theme} position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "inherit" } }} />;
}
