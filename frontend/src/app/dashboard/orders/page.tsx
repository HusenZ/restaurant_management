"use client";

import { ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { OrderCard, PageHeader } from "@/components/dashboard";
import { Empty, Segmented, Skeleton } from "@/components/ui";
import { staffFetcher } from "@/lib/api";
import { cn } from "@/lib/format";
import type { Order, OrderType } from "@/lib/types";

const COLUMNS: { key: string; title: string; statuses: string[]; tone: string }[] = [
  { key: "new", title: "New", statuses: ["placed"], tone: "bg-sky-500" },
  { key: "preparing", title: "Preparing", statuses: ["preparing"], tone: "bg-amber-500" },
  { key: "ready", title: "Ready / out", statuses: ["ready", "out_for_delivery"], tone: "bg-emerald-500" },
  { key: "upcoming", title: "Upcoming pre-orders", statuses: ["scheduled"], tone: "bg-violet-500" },
];

export default function OrdersBoard() {
  const [type, setType] = useState<"all" | OrderType>("all");
  const { data: active } = useSWR<Order[]>("/orders?active=true", staffFetcher, { refreshInterval: 30_000 });
  const { data: recent } = useSWR<Order[]>("/orders?hours=12&limit=60", staffFetcher, { refreshInterval: 60_000 });

  const filtered = useMemo(() => (active ?? []).filter((o) => type === "all" || o.order_type === type), [active, type]);
  const done = useMemo(
    () => (recent ?? []).filter((o) => ["served", "completed", "cancelled"].includes(o.status) && (type === "all" || o.order_type === type)).slice(0, 12),
    [recent, type],
  );

  return (
    <div>
      <PageHeader
        title="Live orders"
        subtitle="Dine-in rounds, takeaway and delivery in one queue. Updates instantly."
        actions={
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: "all", label: "All" },
              { value: "dine_in", label: "Dine-in" },
              { value: "takeaway", label: "Takeaway" },
              { value: "delivery", label: "Delivery" },
            ]}
          />
        }
      />
      {!active ? (
        <div className="grid gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const orders = filtered
              .filter((o) => col.statuses.includes(o.status))
              .sort((a, b) => (col.key === "upcoming" ? (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? "") : a.created_at.localeCompare(b.created_at)));
            return (
              <section key={col.key} className="flex min-h-40 flex-col rounded-3xl bg-surface-3/80 p-3">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={cn("size-2.5 rounded-full", col.tone)} />
                  <h2 className="font-bold">{col.title}</h2>
                  <span className="ml-auto rounded-full bg-surface px-2 text-sm font-bold text-muted">{orders.length}</span>
                </div>
                <div className="space-y-3">
                  {orders.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-subtle">Nothing here</p>
                  ) : (
                    orders.map((o) => <OrderCard key={o.id} o={o} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-bold">Recently completed</h2>
      {done.length === 0 ? (
        <Empty icon={<ClipboardList className="size-8" />} title="No completed orders yet today" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{done.map((o) => <OrderCard key={o.id} o={o} compact />)}</div>
      )}
    </div>
  );
}
