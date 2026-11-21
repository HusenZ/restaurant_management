"use client";

import { Clock, MapPin } from "lucide-react";
import { useEffect } from "react";
import { cn, initials } from "@/lib/format";
import { ThemeToggle } from "./theme";
import type { PublicRestaurant } from "@/lib/types";

/** Applies the restaurant's theme colour to everything inside (and the page chrome). */
export function BrandScope({ color, children, className }: { color?: string | null; children: React.ReactNode; className?: string }) {
  useEffect(() => {
    if (!color) return;
    const root = document.documentElement;
    const prev = root.style.getPropertyValue("--brand");
    root.style.setProperty("--brand", color);
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevMeta = meta?.getAttribute("content");
    meta?.setAttribute("content", color);
    return () => {
      root.style.setProperty("--brand", prev || "#e8590c");
      if (prevMeta) meta?.setAttribute("content", prevMeta);
    };
  }, [color]);
  return (
    <div className={className} style={color ? ({ "--brand": color } as React.CSSProperties) : undefined}>
      {children}
    </div>
  );
}

export function RestaurantLogo({ r, size = "md" }: { r: Pick<PublicRestaurant, "name" | "logo_url">; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "size-9 text-sm" : size === "lg" ? "size-16 text-xl" : "size-11 text-base";
  if (r.logo_url) return <img src={r.logo_url} alt="" className={cn("rounded-2xl object-cover", dims)} />;
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-2xl bg-brand font-extrabold text-brand-ink shadow-sm", dims)}>
      {initials(r.name)}
    </div>
  );
}

export function OpenStatus({ r }: { r: PublicRestaurant }) {
  const hours = r.settings.opening_time === r.settings.closing_time
    ? "Open 24 hours"
    : `${fmt(r.settings.opening_time)} – ${fmt(r.settings.closing_time)}`;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={cn("size-2 rounded-full", r.is_open_now ? "bg-emerald-500" : "bg-rose-500")} />
      <span className={cn("font-semibold", r.is_open_now ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>{r.is_open_now ? "Open now" : "Closed"}</span>
      <span className="text-muted">· {hours}</span>
    </span>
  );
}

function fmt(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: m ? "2-digit" : undefined });
}

export function RestaurantHero({ r }: { r: PublicRestaurant }) {
  return (
    <div className="relative overflow-hidden">
      <ThemeToggle className="absolute right-3 top-3 z-10 bg-surface/80 shadow-sm backdrop-blur" />
      {r.cover_url ? (
        <img src={r.cover_url} alt="" className="h-44 w-full object-cover sm:h-56" />
      ) : (
        <div className="hero-glow h-36 w-full sm:h-44" />
      )}
      <div className="relative -mt-12 px-4">
        <div className="rounded-3xl border border-line-soft bg-surface p-4 shadow-card">
          <div className="flex items-start gap-3">
            <RestaurantLogo r={r} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold leading-tight text-fg">{r.name}</h1>
              {r.tagline && <p className="text-sm text-muted">{r.tagline}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <OpenStatus r={r} />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {r.address_line && (
              <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {r.address_line}{r.city ? `, ${r.city}` : ""}</span>
            )}
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> ~{r.settings.avg_prep_minutes} min prep</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PoweredBy() {
  return (
    <p className="py-6 text-center text-xs text-subtle">
      Powered by <a href="/" className="font-semibold text-muted">DineOS</a>
    </p>
  );
}
