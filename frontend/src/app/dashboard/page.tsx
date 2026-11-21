"use client";

import { ArrowRight, CheckCircle2, ChefHat, Circle, IndianRupee, LayoutGrid, Receipt, ShoppingBag, Star, Timer, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Bars, PageHeader, StatCard } from "@/components/dashboard";
import { Card, PageLoader, Segmented, Skeleton } from "@/components/ui";
import { staffFetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, money, moneyShort, ORDER_TYPE_LABEL, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { AnalyticsSummary, Feedback, OnboardingStep } from "@/lib/types";

const METHOD_LABEL: Record<string, string> = { upi: "UPI", card: "Card", cash: "Cash", online: "Online", split: "Split" };
const METHOD_COLOR: Record<string, string> = { upi: "bg-violet-500", card: "bg-sky-500", cash: "bg-emerald-500", online: "bg-brand", split: "bg-zinc-400" };

export default function Overview() {
  const [days, setDays] = useState<"1" | "7" | "30">("7");
  const { data } = useSWR<AnalyticsSummary>(`/analytics/summary?days=${days}`, staffFetcher, { refreshInterval: 60_000 });
  const { data: steps } = useSWR<OnboardingStep[]>("/restaurant/onboarding", staffFetcher);
  const { data: feedback } = useSWR<Feedback[]>("/feedback?limit=5", staffFetcher);
  const restaurant = useAuth((s) => s.restaurant);
  const now = useNow(60_000);

  const greeting = (() => {
    const h = new Date(now || Date.now()).getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();
  const pending = steps?.filter((s) => !s.done) ?? [];

  return (
    <div>
      <PageHeader
        title={`${greeting} 👋`}
        subtitle={`Here's how ${restaurant?.name ?? "your restaurant"} is doing`}
        actions={
          <Segmented
            value={days}
            onChange={setDays}
            options={[{ value: "1", label: "Today" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]}
          />
        }
      />

      {pending.length > 0 && steps && (
        <Card className="mb-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
            <div>
              <p className="font-extrabold">Get set up — {steps.length - pending.length}/{steps.length} done</p>
              <p className="text-sm text-muted">Restaurants that finish setup take their first QR order within a day.</p>
            </div>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full bg-emerald-500" style={{ width: `${((steps.length - pending.length) / steps.length) * 100}%` }} />
            </div>
          </div>
          <ul className="grid gap-px bg-surface-3 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s) => (
              <li key={s.key} className="bg-surface">
                <Link href={s.href} className="flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-surface-2">
                  {s.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-subtle" />}
                  <span className={cn("flex-1", s.done ? "text-subtle line-through" : "font-semibold text-fg-2")}>{s.title}</span>
                  {!s.done && <ArrowRight className="size-4 text-subtle" />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Tables occupied", value: data.live.occupied_tables, icon: <LayoutGrid className="size-4" />, href: "/dashboard/tables" },
              { label: "In the kitchen", value: data.live.kitchen_orders, icon: <ChefHat className="size-4" />, href: "/dashboard/kitchen" },
              { label: "Counter queue", value: data.live.counter_queue, icon: <Receipt className="size-4" />, href: "/dashboard/billing" },
              { label: "Guest requests", value: data.live.open_requests, icon: <Users className="size-4" />, href: "/dashboard/tables" },
            ].map((x) => (
              <Link key={x.label} href={x.href} className="flex items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-white ring-1 ring-white/5 transition hover:bg-zinc-800 dark:bg-surface-2 dark:ring-line dark:hover:bg-surface-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/10">{x.icon}</span>
                <span>
                  <span className="tabular block text-xl font-extrabold leading-none">{x.value}</span>
                  <span className="text-xs text-white/60">{x.label}</span>
                </span>
                {x.value > 0 && x.label !== "Tables occupied" && x.label !== "In the kitchen" && <span className="ml-auto size-2 animate-pulse rounded-full bg-rose-400" />}
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Revenue" value={money(data.kpis.revenue)} change={data.kpis.revenue_change} icon={<IndianRupee className="size-4" />} />
            <StatCard label="Orders" value={data.kpis.orders} change={data.kpis.orders_change} icon={<ShoppingBag className="size-4" />} />
            <StatCard label="Avg. bill value" value={money(data.kpis.aov)} change={data.kpis.aov_change} icon={<Receipt className="size-4" />} />
            <StatCard
              label="Avg. kitchen time"
              value={data.kpis.avg_prep_minutes ? `${data.kpis.avg_prep_minutes} min` : "—"}
              icon={<Timer className="size-4" />}
              hint={data.kpis.rating ? `★ ${data.kpis.rating} from ${data.kpis.ratings_count} ratings` : "From order to ready"}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="mb-4 flex items-baseline justify-between">
                <p className="font-bold">Revenue by day</p>
                <p className="text-xs text-muted">Paid bills</p>
              </div>
              <Bars data={data.daily.map((d) => ({ label: d.label, value: d.revenue }))} format={moneyShort} highlightLast height={220} />
            </Card>
            <Card className="p-5">
              <p className="mb-4 font-bold">Top dishes</p>
              {data.top_items.length === 0 ? (
                <p className="text-sm text-muted">No orders in this period yet.</p>
              ) : (
                <ol className="space-y-3">
                  {data.top_items.slice(0, 6).map((it, i) => {
                    const max = data.top_items[0].quantity;
                    return (
                      <li key={it.name}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="truncate font-semibold"><span className="mr-2 text-subtle">{i + 1}</span>{it.name}</span>
                          <span className="tabular shrink-0 text-muted">{it.quantity} sold</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-surface-3"><div className="h-full rounded-full bg-brand/70" style={{ width: `${(it.quantity / max) * 100}%` }} /></div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="mb-4 flex items-baseline justify-between">
                <p className="font-bold">Orders by hour</p>
                <p className="text-xs text-muted">Plan staffing for your rush</p>
              </div>
              <Bars data={data.hourly.filter((h) => h.hour >= 8 || h.orders > 0).map((h) => ({ label: h.label, value: h.orders }))} format={(v) => `${v} orders`} height={160} />
            </Card>
            <Card className="space-y-5 p-5">
              <div>
                <p className="mb-3 font-bold">Order channels</p>
                <div className="space-y-2">
                  {data.by_type.map((t) => {
                    const total = data.by_type.reduce((a, x) => a + x.orders, 0) || 1;
                    return (
                      <div key={t.type} className="flex items-center gap-3 text-sm">
                        <span className="w-20 text-muted">{ORDER_TYPE_LABEL[t.type]}</span>
                        <div className="h-2 flex-1 rounded-full bg-surface-3"><div className="h-full rounded-full bg-fg-2" style={{ width: `${(t.orders / total) * 100}%` }} /></div>
                        <span className="tabular w-10 text-right font-semibold">{t.orders}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-3 font-bold">Payment methods</p>
                {data.payment_methods.length === 0 ? (
                  <p className="text-sm text-muted">No payments yet.</p>
                ) : (
                  <>
                    <div className="flex h-3 overflow-hidden rounded-full">
                      {data.payment_methods.map((m) => {
                        const total = data.payment_methods.reduce((a, x) => a + x.amount, 0);
                        return <div key={m.method} className={METHOD_COLOR[m.method] ?? "bg-zinc-400"} style={{ width: `${(m.amount / total) * 100}%` }} />;
                      })}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      {data.payment_methods.map((m) => (
                        <li key={m.method} className="flex items-center gap-1.5">
                          <span className={cn("size-2 rounded-full", METHOD_COLOR[m.method] ?? "bg-zinc-400")} />
                          {METHOD_LABEL[m.method] ?? m.method} · {moneyShort(m.amount)}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </Card>
          </div>

          <Card className="mt-4 p-5">
            <p className="mb-3 font-bold">Latest guest feedback</p>
            {!feedback ? (
              <PageLoader />
            ) : feedback.length === 0 ? (
              <p className="text-sm text-muted">Guests are asked for a rating right after they pay.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {feedback.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <span className="flex items-center gap-0.5 font-bold text-amber-600">{f.rating}<Star className="size-3.5 fill-amber-400 text-amber-400" /></span>
                    <span className="flex-1 text-fg-2">{f.comment ?? <span className="text-subtle">No comment</span>}</span>
                    <span className="shrink-0 text-xs text-subtle">{f.customer_name ? `${f.customer_name} · ` : ""}{timeAgo(f.created_at, now || undefined)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
