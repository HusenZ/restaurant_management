"use client";

import { CalendarCheck, Car, ChefHat, ChevronLeft, ChevronRight, Phone, Plus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { PageHeader, refreshAll } from "@/components/dashboard";
import { Badge, Button, Card, Empty, Field, Input, Sheet, Skeleton, StatusPill, Textarea } from "@/components/ui";
import { api, publicFetcher, staffFetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { clock, cn, money } from "@/lib/format";
import type { LiveTable, ReservationDetail, Slot } from "@/lib/types";

const TONE: Record<string, string> = {
  pending: "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/30",
  confirmed: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/30",
  seated: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-500/30",
  completed: "bg-surface-3 text-muted ring-line",
  cancelled: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-500/30",
  no_show: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-500/30",
};

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReservationsPage() {
  const [day, setDay] = useState("");
  useEffect(() => setDay(isoDay(new Date())), []);
  const { data } = useSWR<ReservationDetail[]>(day ? `/reservations?day=${day}` : null, staffFetcher, { refreshInterval: 60_000 });
  const [seating, setSeating] = useState<ReservationDetail | null>(null);
  const [creating, setCreating] = useState(false);

  const shift = (n: number) => {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + n);
    setDay(isoDay(d));
  };
  const active = (data ?? []).filter((r) => !["cancelled", "no_show"].includes(r.reservation.status));
  const covers = active.reduce((a, r) => a + r.reservation.party_size, 0);
  const preorders = active.filter((r) => r.preorder).length;

  const update = async (id: string, status: string) => {
    try {
      await api(`/reservations/${id}`, { method: "PATCH", body: { status } });
      refreshAll();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reservations"
        subtitle={data ? `${active.length} bookings · ${covers} covers · ${preorders} with pre-order` : "Bookings and pre-orders"}
        actions={
          <>
            <div className="flex items-center rounded-xl border border-line bg-surface">
              <button className="p-2.5" onClick={() => shift(-1)} aria-label="Previous day"><ChevronLeft className="size-4" /></button>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="bg-transparent px-1 text-sm font-semibold outline-none" />
              <button className="p-2.5" onClick={() => shift(1)} aria-label="Next day"><ChevronRight className="size-4" /></button>
            </div>
            <Button onClick={() => setCreating(true)}><Plus className="size-4" /> Phone booking</Button>
          </>
        }
      />

      {!data ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : data.length === 0 ? (
        <Empty icon={<CalendarCheck className="size-8" />} title="No bookings for this day" body="Share your booking link — guests can reserve and pre-order from Instagram, Google or WhatsApp." />
      ) : (
        <div className="space-y-3">
          {data.map((d) => {
            const r = d.reservation;
            return (
              <Card key={r.id} className={cn("flex flex-wrap items-start gap-4 p-4", ["cancelled", "no_show", "completed"].includes(r.status) && "opacity-60")}>
                <div className="w-20 shrink-0 text-center">
                  <p className="text-xl font-black">{clock(r.reserved_for)}</p>
                  <p className="text-xs text-muted">{r.duration_minutes} min</p>
                </div>
                <div className="min-w-52 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-bold">{r.customer_name}</p>
                    <Badge className={TONE[r.status]}>{r.status.replace("_", "-")}</Badge>
                    {r.occasion && <Badge className="bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300 ring-pink-200 dark:ring-pink-500/30">🎉 {r.occasion}</Badge>}
                    {r.guest_on_way_at && r.status === "confirmed" && <Badge className="bg-emerald-600 text-white ring-emerald-600"><Car className="size-3" /> On the way</Badge>}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                    <span className="flex items-center gap-1"><Users className="size-3.5" /> {r.party_size} guests</span>
                    <a href={`tel:${r.customer_phone}`} className="flex items-center gap-1 hover:text-fg-2"><Phone className="size-3.5" /> {r.customer_phone}</a>
                    {d.table_label && <span>Table <b className="text-fg-2">{d.table_label}</b></span>}
                    <span className="font-mono text-xs">{r.code}</span>
                  </p>
                  {r.notes && <p className="mt-1.5 text-sm text-amber-800 dark:text-amber-300">📝 {r.notes}</p>}
                  {d.preorder && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 dark:bg-violet-500/10 px-3 py-2 text-sm">
                      <ChefHat className="size-4 text-violet-600" />
                      <span className="font-semibold text-violet-900 dark:text-violet-200">Pre-order {money(d.preorder.subtotal)}:</span>
                      <span className="text-violet-800 dark:text-violet-300">{d.preorder.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</span>
                      <StatusPill status={d.preorder.status} label={d.preorder.status === "scheduled" ? `fires ${clock(d.preorder.scheduled_for)}` : undefined} />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.status === "pending" && <Button size="sm" onClick={() => update(r.id, "confirmed")}>Confirm</Button>}
                  {(r.status === "pending" || r.status === "confirmed") && (
                    <>
                      <Button size="sm" variant="dark" onClick={() => setSeating(d)}>Seat</Button>
                      <Button size="sm" variant="outline" onClick={() => confirm(`Mark ${r.customer_name} as no-show?`) && update(r.id, "no_show")}>No-show</Button>
                      <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => confirm("Cancel this booking?") && update(r.id, "cancelled")}>Cancel</Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SeatDialog res={seating} onClose={() => setSeating(null)} />
      <NewBooking open={creating} onClose={() => setCreating(false)} defaultDay={day} />
    </div>
  );
}

function SeatDialog({ res, onClose }: { res: ReservationDetail | null; onClose: () => void }) {
  const { data } = useSWR<LiveTable[]>(res ? "/tables/live" : null, staffFetcher);
  const [busy, setBusy] = useState<string | null>(null);
  if (!res) return null;
  const free = (data ?? []).filter((t) => t.state === "free").sort((a, b) => a.table.capacity - b.table.capacity);
  const fits = free.filter((t) => t.table.capacity >= res.reservation.party_size);
  const seat = async (tableId: string) => {
    setBusy(tableId);
    try {
      await api(`/reservations/${res.reservation.id}/seat`, { body: { table_id: tableId } });
      toast.success(`${res.reservation.customer_name} seated${res.preorder ? " · pre-order sent to kitchen" : ""}`);
      refreshAll();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`Seat ${res.reservation.customer_name} · ${res.reservation.party_size} guests`}>
      {!data ? <Skeleton className="h-24" /> : free.length === 0 ? (
        <p className="text-sm text-muted">No free tables right now.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">Best fits first. The pre-order (if any) moves onto this table&apos;s bill.</p>
          <div className="grid grid-cols-3 gap-2">
            {(fits.length ? fits : free).map((t) => (
              <button key={t.table.id} disabled={busy !== null} onClick={() => seat(t.table.id)} className="rounded-2xl border-2 border-line p-3 text-left hover:border-brand">
                <p className="text-xl font-black">{t.table.label}</p>
                <p className="text-xs text-muted">{t.table.area} · {t.table.capacity} seats</p>
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

function NewBooking({ open, onClose, defaultDay }: { open: boolean; onClose: () => void; defaultDay: string }) {
  const slug = useAuth((s) => s.restaurant?.slug);
  const [day, setDay] = useState(defaultDay);
  const [party, setParty] = useState("2");
  const [slot, setSlot] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setDay(defaultDay), [defaultDay]);
  const { data: slots } = useSWR<Slot[]>(open && slug && day ? `/public/restaurants/${slug}/slots?date=${day}&party_size=${party || 2}` : null, publicFetcher);
  const available = useMemo(() => (slots ?? []).filter((s) => s.available), [slots]);
  const submit = async () => {
    setBusy(true);
    try {
      await api("/reservations", { body: { customer_name: name, customer_phone: phone, party_size: Number(party), reserved_for: slot, notes: notes || undefined } });
      toast.success("Booking added");
      refreshAll();
      onClose();
      setName(""); setPhone(""); setNotes(""); setSlot("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="New phone booking" footer={<Button block size="lg" loading={busy} disabled={!slot || !name || phone.length < 6} onClick={submit}>Add booking</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Guests"><Input type="number" min={1} value={party} onChange={(e) => setParty(e.target.value)} /></Field>
      </div>
      <p className="mb-1.5 mt-3 text-sm font-medium text-fg-2">Time</p>
      <div className="flex flex-wrap gap-2">
        {available.length === 0 && <p className="text-sm text-muted">No available slots.</p>}
        {available.map((s) => (
          <button key={s.time} onClick={() => setSlot(s.time)} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold", slot === s.time ? "border-brand bg-brand text-white" : "border-line")}>{s.label}</button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      <Field className="mt-3" label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Sheet>
  );
}
