"use client";

import { BellRing, CalendarClock, LayoutGrid, Minus, Plus, Receipt, Store, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { PageHeader, refreshAll, SessionDrawer } from "@/components/dashboard";
import { Button, Empty, Field, Input, Segmented, Sheet, Skeleton } from "@/components/ui";
import { api, staffFetcher } from "@/lib/api";
import { clock, cn, minutesSince, money, REQUEST_LABEL } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { DiningSession, LiveTable, TableState } from "@/lib/types";

const STATE: Record<TableState, { label: string; tile: string; dot: string }> = {
  free: { label: "Free", tile: "border-line bg-surface hover:border-line-strong", dot: "bg-line-strong" },
  occupied: { label: "Occupied", tile: "border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10", dot: "bg-sky-500" },
  bill_requested: { label: "Bill requested", tile: "border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10", dot: "bg-amber-500" },
  awaiting_counter: { label: "Paying at counter", tile: "border-violet-300 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10", dot: "bg-violet-500" },
  attention: { label: "Needs attention", tile: "border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 ring-2 ring-rose-300/60 dark:ring-rose-500/30", dot: "bg-rose-500 animate-pulse" },
};

export default function TablesPage() {
  const { data } = useSWR<LiveTable[]>("/tables/live", staffFetcher, { refreshInterval: 30_000 });
  const [area, setArea] = useState("All");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [seatTable, setSeatTable] = useState<LiveTable | null>(null);
  const now = useNow(30_000);

  const areas = useMemo(() => ["All", ...Array.from(new Set((data ?? []).map((t) => t.table.area)))], [data]);
  const tables = (data ?? []).filter((t) => area === "All" || t.table.area === area);
  const counts = (data ?? []).reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.state]: (acc[t.state] ?? 0) + 1 }), {});

  return (
    <div>
      <PageHeader
        title="Tables"
        subtitle={data ? `${(data.length - (counts.free ?? 0))} of ${data.length} occupied` : "Live floor view"}
        actions={areas.length > 2 ? <Segmented value={area} onChange={setArea} options={areas.map((a) => ({ value: a, label: a }))} /> : undefined}
      />
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {(Object.keys(STATE) as TableState[]).map((s) => (
          <span key={s} className="flex items-center gap-2 text-muted">
            <span className={cn("size-2.5 rounded-full", STATE[s].dot)} /> {STATE[s].label} <b className="text-fg">{counts[s] ?? 0}</b>
          </span>
        ))}
      </div>

      {!data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : data.length === 0 ? (
        <Empty icon={<LayoutGrid className="size-8" />} title="No tables yet" body="Add your tables to generate QR codes for each one." action={<Link href="/dashboard/qr"><Button>Add tables</Button></Link>} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {tables.map((t) => {
            const st = STATE[t.state];
            const mins = t.session ? minutesSince(t.session.opened_at, now || undefined) : 0;
            return (
              <button
                key={t.table.id}
                onClick={() => (t.session ? setSessionId(t.session.id) : setSeatTable(t))}
                className={cn("relative flex min-h-36 flex-col rounded-2xl border-2 p-3.5 text-left transition active:scale-[0.98]", st.tile)}
              >
                <div className="flex items-start justify-between">
                  <span className="text-2xl font-black text-fg">{t.table.label}</span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-muted"><Users className="size-3.5" />{t.session ? `${t.session.guest_count}/` : ""}{t.table.capacity}</span>
                </div>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted"><span className={cn("size-2 rounded-full", st.dot)} />{st.label}</span>
                <div className="mt-auto pt-3">
                  {t.session ? (
                    <>
                      <p className="tabular text-lg font-extrabold text-fg">{money(t.running_total)}</p>
                      <p className="text-xs text-muted">
                        {mins}m · {t.orders_count} round{t.orders_count === 1 ? "" : "s"}
                        {t.active_orders > 0 && <span className="font-semibold text-amber-700 dark:text-amber-300"> · {t.active_orders} cooking</span>}
                      </p>
                    </>
                  ) : t.upcoming_reservation ? (
                    <p className="flex items-center gap-1 text-xs font-semibold text-violet-700 dark:text-violet-300"><CalendarClock className="size-3.5" /> {t.upcoming_reservation.name} · {clock(t.upcoming_reservation.reserved_for)}</p>
                  ) : (
                    <p className="text-xs text-subtle">Tap to seat guests</p>
                  )}
                </div>
                {t.open_requests.length > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white shadow">
                    <BellRing className="size-3" /> {REQUEST_LABEL[t.open_requests[0].kind]}
                  </span>
                )}
                {t.state === "awaiting_counter" && <Store className="absolute bottom-3 right-3 size-5 text-violet-500" />}
                {t.state === "bill_requested" && <Receipt className="absolute bottom-3 right-3 size-5 text-amber-500" />}
              </button>
            );
          })}
        </div>
      )}

      <SessionDrawer sessionId={sessionId} onClose={() => setSessionId(null)} />
      <SeatSheet table={seatTable} onClose={() => setSeatTable(null)} onSeated={(s) => { setSeatTable(null); setSessionId(s.id); }} />
    </div>
  );
}

function SeatSheet({ table, onClose, onSeated }: { table: LiveTable | null; onClose: () => void; onSeated: (s: DiningSession) => void }) {
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!table) return null;
  const seat = async () => {
    setBusy(true);
    try {
      const s = await api<DiningSession>("/sessions", { body: { table_id: table.table.id, guest_count: guests, guest_name: name || undefined } });
      refreshAll();
      onSeated(s);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`Seat guests · Table ${table.table.label}`} footer={<Button block size="lg" loading={busy} onClick={seat}>Seat & open table</Button>}>
      <p className="text-sm text-muted">Walk-in guests can still scan the table QR to order and pay — they join this session automatically.</p>
      <div className="mt-4 flex items-center gap-4">
        <span className="text-sm font-medium text-fg-2">Guests</span>
        <button className="flex size-10 items-center justify-center rounded-xl border border-line" onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="Fewer"><Minus className="size-4" /></button>
        <span className="tabular w-8 text-center text-xl font-bold">{guests}</span>
        <button className="flex size-10 items-center justify-center rounded-xl border border-line" onClick={() => setGuests((g) => g + 1)} aria-label="More"><Plus className="size-4" /></button>
      </div>
      <Field className="mt-4" label="Guest name (optional)"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Sheet>
  );
}
