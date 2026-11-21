"use client";

import { ArrowLeft, CheckCheck, Flame, ListOrdered, Maximize2, RotateCcw, Timer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { refreshAll } from "@/components/dashboard";
import { DietIcon } from "@/components/ui";
import { api, staffFetcher } from "@/lib/api";
import { clock, cn, pad3 } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { Order } from "@/lib/types";

function elapsed(iso: string | null, now: number) {
  if (!iso || !now) return { label: "0:00", minutes: 0 };
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  return { label: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, minutes: s / 60 };
}

async function setStatus(o: Order, status: string) {
  try {
    await api(`/orders/${o.id}/status`, { method: "PATCH", body: { status } });
    refreshAll();
  } catch (e) {
    toast.error((e as Error).message);
  }
}

function Ticket({ o, now, onItem }: { o: Order; now: number; onItem: (o: Order, itemId: string, done: boolean) => void }) {
  const t = elapsed(o.fired_at ?? o.created_at, now);
  const head = t.minutes >= 20 ? "bg-rose-600" : t.minutes >= 10 ? "bg-amber-500" : "bg-emerald-600";
  const allDone = o.items.every((i) => i.is_done);
  return (
    <article className={cn("flex flex-col overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10", o.status === "placed" && "ring-2 ring-sky-400")}>
      <header className={cn("flex items-center justify-between px-4 py-2.5 text-white", head)}>
        <div>
          <p className="font-mono text-2xl font-black leading-none">{pad3(o.number)}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-white/85">
            {o.order_type === "dine_in" ? (o.table_label ? `Table ${o.table_label}` : "Dine-in · pre-order") : o.order_type === "delivery" ? "Delivery" : "Takeaway"}
            {o.source === "reservation" && " · booking"}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular flex items-center gap-1 text-xl font-black"><Timer className="size-4" />{t.label}</p>
          <p className="text-[11px] text-white/80">{o.status === "placed" ? "NEW" : "COOKING"}</p>
        </div>
      </header>
      <ul className="flex-1 divide-y divide-white/5 px-2 py-1">
        {o.items.map((it) => (
          <li key={it.id}>
            <button onClick={() => onItem(o, it.id, !it.is_done)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-white/5">
              <span className={cn("tabular min-w-7 rounded-md px-1.5 text-center text-lg font-black", it.is_done ? "bg-white/5 text-zinc-500" : "bg-white text-zinc-900")}>{it.quantity}</span>
              <span className={cn("flex-1", it.is_done && "text-zinc-500 line-through")}>
                <span className="flex items-center gap-2 text-[17px] font-bold text-white"><DietIcon diet={it.diet} />{it.name}</span>
                {it.modifiers.length > 0 && <span className="block text-sm text-amber-300">{it.modifiers.map((m) => m.name).join(" · ")}</span>}
                {it.notes && <span className="block text-sm font-semibold text-rose-300">⚠ {it.notes}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {o.notes && <p className="mx-3 mb-2 rounded-lg bg-amber-400/15 px-3 py-2 text-sm font-semibold text-amber-200">📝 {o.notes}</p>}
      <div className="p-3 pt-1">
        {o.status === "placed" ? (
          <button onClick={() => setStatus(o, "preparing")} className="h-12 w-full rounded-xl bg-sky-500 text-base font-extrabold text-white active:scale-[0.98]">Start cooking</button>
        ) : (
          <button onClick={() => setStatus(o, "ready")} className={cn("flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-extrabold active:scale-[0.98]", allDone ? "bg-emerald-500 text-white" : "bg-white text-zinc-900")}>
            <CheckCheck className="size-5" /> Bump · ready
          </button>
        )}
      </div>
    </article>
  );
}

export default function KitchenDisplay() {
  const now = useNow(1000);
  const [showAllDay, setShowAllDay] = useState(false);
  const { data, mutate } = useSWR<Order[]>("/orders?active=true", staffFetcher, { refreshInterval: 20_000 });

  const cooking = useMemo(
    () => (data ?? []).filter((o) => o.status === "placed" || o.status === "preparing").sort((a, b) => (a.fired_at ?? a.created_at).localeCompare(b.fired_at ?? b.created_at)),
    [data],
  );
  const ready = useMemo(() => (data ?? []).filter((o) => o.status === "ready").slice(0, 12), [data]);
  const upcoming = useMemo(() => (data ?? []).filter((o) => o.status === "scheduled").sort((a, b) => (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? "")), [data]);
  const allDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of cooking) for (const it of o.items) if (!it.is_done) m.set(it.name, (m.get(it.name) ?? 0) + it.quantity);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [cooking]);

  const onItem = async (o: Order, itemId: string, done: boolean) => {
    mutate(
      (prev) => prev?.map((x) => (x.id === o.id ? { ...x, items: x.items.map((i) => (i.id === itemId ? { ...i, is_done: done } : i)) } : x)),
      { revalidate: false },
    );
    try {
      await api(`/orders/${o.id}/items/${itemId}`, { method: "PATCH", body: { is_done: done } });
    } catch (e) {
      toast.error((e as Error).message);
      mutate();
    }
  };

  return (
    <div className="min-h-dvh text-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <Link href="/dashboard/orders" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10" aria-label="Back to dashboard"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-lg font-extrabold">Kitchen</h1>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-bold">{cooking.length} active</span>
        <div className="flex-1" />
        <span className="tabular hidden text-lg font-bold text-zinc-300 sm:block">{now ? new Date(now).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : ""}</span>
        <button onClick={() => setShowAllDay((v) => !v)} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold", showAllDay ? "bg-white text-zinc-900" : "text-zinc-300 hover:bg-white/10")}>
          <ListOrdered className="size-4" /> All-day
        </button>
        <button onClick={() => document.documentElement.requestFullscreen?.()} className="rounded-lg p-2 text-zinc-400 hover:bg-white/10" aria-label="Full screen"><Maximize2 className="size-5" /></button>
      </header>

      <div className="flex gap-4 p-4">
        <div className="min-w-0 flex-1">
          {!data ? (
            <p className="p-10 text-center text-zinc-500">Loading tickets…</p>
          ) : cooking.length === 0 ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center text-zinc-500">
              <p className="text-5xl">🍳</p>
              <p className="mt-3 text-lg font-bold text-zinc-300">All caught up</p>
              <p className="text-sm">New tickets appear here with an on-screen alert.</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-start gap-4">
              {cooking.map((o) => <Ticket key={o.id} o={o} now={now} onItem={onItem} />)}
            </div>
          )}

          {ready.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-emerald-400">Ready · waiting for pickup / service</h2>
              <div className="flex flex-wrap gap-2">
                {ready.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 rounded-xl bg-emerald-500/15 px-3 py-2 ring-1 ring-emerald-500/30">
                    <span className="font-mono text-lg font-black text-emerald-300">{pad3(o.number)}</span>
                    <span className="text-sm text-emerald-100">{o.table_label ?? (o.order_type === "delivery" ? "Delivery" : "Takeaway")}</span>
                    <button onClick={() => setStatus(o, "preparing")} className="rounded-md p-1 text-emerald-300 hover:bg-white/10" title="Recall to kitchen" aria-label="Recall"><RotateCcw className="size-4" /></button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="hidden w-72 shrink-0 space-y-4 xl:block">
          {showAllDay && (
            <div className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/10">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">All-day counts</h2>
              {allDay.length === 0 ? <p className="text-sm text-zinc-500">Nothing to cook.</p> : (
                <ul className="space-y-1.5">{allDay.map(([name, qty]) => <li key={name} className="flex justify-between text-sm"><span>{name}</span><span className="tabular font-black">{qty}</span></li>)}</ul>
              )}
            </div>
          )}
          <div className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/10">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-violet-300">Upcoming pre-orders</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-zinc-500">Pre-orders from table bookings show here before they fire.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((o) => (
                  <li key={o.id} className="rounded-xl bg-violet-500/10 p-3 ring-1 ring-violet-400/20">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{o.customer_name}</span>
                      <span className="text-xs text-violet-200">fires {clock(o.scheduled_for)}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                    <button onClick={async () => { await api(`/orders/${o.id}/fire`, { method: "POST" }).catch((e) => toast.error(e.message)); refreshAll(); }} className="mt-2 flex items-center gap-1 text-xs font-bold text-violet-200 hover:text-white">
                      <Flame className="size-3.5" /> Fire now
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
