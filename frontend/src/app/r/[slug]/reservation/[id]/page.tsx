"use client";

import { ArrowLeft, CalendarPlus, Car, CheckCircle2, ChefHat, Clock, Hourglass, MapPin, Users, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { BrandScope, PoweredBy } from "@/components/guest";
import { Button, DietIcon, PageLoader, StatusPill } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
import { api, guestFetcher, publicFetcher } from "@/lib/api";
import { clock, cn, dateLabel, GUEST_STATUS_LABEL, money } from "@/lib/format";
import { guestTokens, useHydrated, useRealtime } from "@/lib/hooks";
import type { PublicRestaurant, ReservationDetail } from "@/lib/types";

const STATUS_COPY: Record<string, { title: string; tone: string; icon: typeof CheckCircle2 }> = {
  pending: { title: "Booking requested", tone: "bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 ring-amber-200 dark:ring-amber-500/30", icon: Hourglass },
  confirmed: { title: "Table confirmed", tone: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 ring-emerald-200 dark:ring-emerald-500/30", icon: CheckCircle2 },
  seated: { title: "Enjoy your meal!", tone: "bg-sky-50 dark:bg-sky-500/10 text-sky-900 dark:text-sky-200 ring-sky-200 dark:ring-sky-500/30", icon: Users },
  completed: { title: "Thanks for visiting", tone: "bg-surface-3 text-fg-2 ring-line", icon: CheckCircle2 },
  cancelled: { title: "Booking cancelled", tone: "bg-rose-50 dark:bg-rose-500/10 text-rose-900 dark:text-rose-200 ring-rose-200 dark:ring-rose-500/30", icon: XCircle },
  no_show: { title: "Marked as no-show", tone: "bg-rose-50 dark:bg-rose-500/10 text-rose-900 dark:text-rose-200 ring-rose-200 dark:ring-rose-500/30", icon: XCircle },
};

function downloadIcs(d: ReservationDetail) {
  const start = new Date(d.reservation.reserved_for);
  const end = new Date(start.getTime() + d.reservation.duration_minutes * 60000);
  const f = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DineOS//EN", "BEGIN:VEVENT",
    `UID:${d.reservation.id}@dineos`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:Table for ${d.reservation.party_size} at ${d.restaurant_name}`,
    `LOCATION:${d.restaurant_address ?? d.restaurant_name}`,
    `DESCRIPTION:Booking ref ${d.reservation.code}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `booking-${d.reservation.code}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function ReservationPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const hydrated = useHydrated();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setToken(guestTokens.get(`reservation:${id}`)), [id]);

  const { data: r } = useSWR<PublicRestaurant>(`/public/restaurants/${slug}`, publicFetcher);
  const { data, mutate } = useSWR<ReservationDetail>(token ? ["/public/reservations/me", token] : null, guestFetcher, { refreshInterval: 30_000 });
  useRealtime(token ? `/ws/guest?token=${token}` : null, () => mutate());

  if (!hydrated) return <PageLoader />;
  if (!token)
    return (
      <div className="p-10 text-center text-sm">
        <p className="font-semibold">This booking isn&apos;t saved on this device.</p>
        <Link href={`/r/${slug}/book`} className="mt-3 inline-block font-semibold text-brand">Make a booking</Link>
      </div>
    );
  if (!data || !r) return <PageLoader label="Loading your booking…" />;

  const res = data.reservation;
  const pre = data.preorder;
  const copy = STATUS_COPY[res.status] ?? STATUS_COPY.pending;
  const Icon = copy.icon;
  const active = res.status === "pending" || res.status === "confirmed";

  const act = async (path: string, label: string) => {
    setBusy(path);
    try {
      await mutate(await api<ReservationDetail>(`/public/reservations/me/${path}`, { method: "POST", guestToken: token }), { revalidate: false });
      toast.success(label);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <BrandScope color={r.settings.theme_color} className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-xl pb-10">
        <header className="flex items-center gap-3 bg-surface px-4 py-3">
          <Link href={`/r/${slug}`} className="rounded-full p-1.5 hover:bg-surface-3" aria-label="Back"><ArrowLeft className="size-5" /></Link>
          <p className="font-extrabold">{data.restaurant_name}</p>
          <ThemeToggle className="ml-auto" />
        </header>
        <div className="space-y-3 p-4">
          <div className={cn("rounded-3xl p-5 ring-1", copy.tone)}>
            <div className="flex items-center gap-3">
              <Icon className="size-8" />
              <div>
                <p className="text-xl font-extrabold">{copy.title}</p>
                <p className="text-sm opacity-80">Ref <span className="font-mono font-bold">{res.code}</span></p>
              </div>
            </div>
            {res.status === "pending" && <p className="mt-3 text-sm">The restaurant will confirm shortly — this page updates automatically.</p>}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-surface p-3 shadow-card"><CalendarPlus className="mx-auto size-5 text-brand" /><p className="mt-1 text-sm font-bold">{dateLabel(res.reserved_for)}</p></div>
            <div className="rounded-2xl bg-surface p-3 shadow-card"><Clock className="mx-auto size-5 text-brand" /><p className="mt-1 text-sm font-bold">{clock(res.reserved_for)}</p></div>
            <div className="rounded-2xl bg-surface p-3 shadow-card"><Users className="mx-auto size-5 text-brand" /><p className="mt-1 text-sm font-bold">{res.party_size} guests</p></div>
          </div>
          {(data.table_label || res.occasion) && (
            <p className="text-center text-sm text-muted">
              {data.table_label && <>Table <b>{data.table_label}</b></>}{data.table_label && res.occasion && " · "}{res.occasion && <>🎉 {res.occasion}</>}
            </p>
          )}

          {res.status === "confirmed" && (
            <div className="rounded-3xl bg-surface p-5 text-center shadow-card">
              {res.guest_on_way_at ? (
                <>
                  <Car className="mx-auto size-8 text-emerald-600" />
                  <p className="mt-2 font-bold">The restaurant knows you&apos;re on the way</p>
                  <p className="text-sm text-muted">{pre ? "Your food is being prepared." : "Your table will be ready."}</p>
                </>
              ) : (
                <>
                  <p className="font-bold">Heading out?</p>
                  <p className="mt-1 text-sm text-muted">{pre ? "Tap when you leave and the kitchen starts cooking your pre-order right away." : "Let the restaurant know so your table is ready."}</p>
                  <Button block size="xl" className="mt-4" loading={busy === "on-my-way"} onClick={() => act("on-my-way", "The restaurant has been notified 🚗")}>
                    <Car className="size-5" /> I&apos;m on my way
                  </Button>
                </>
              )}
            </div>
          )}

          {pre && (
            <div className="rounded-3xl bg-surface p-5 shadow-card">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 font-bold"><ChefHat className="size-5 text-brand" /> Your pre-order</p>
                <StatusPill status={pre.status} label={pre.status === "scheduled" ? `Starts ~${clock(pre.scheduled_for)}` : GUEST_STATUS_LABEL[pre.status]} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {pre.items.map((it) => (
                  <li key={it.id} className="flex items-start gap-2 text-sm">
                    <DietIcon diet={it.diet} className="mt-0.5" />
                    <span className="flex-1">{it.quantity} × {it.name}{it.modifiers.length > 0 && <span className="block text-xs text-muted">{it.modifiers.map((m) => m.name).join(" · ")}</span>}</span>
                    <span className="tabular text-muted">{money(it.line_total)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">Added to your table bill — pay after your meal.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => downloadIcs(data)}><CalendarPlus className="size-4" /> Add to calendar</Button>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.restaurant_name} ${data.restaurant_address ?? ""}`)}`} target="_blank" rel="noreferrer">
              <Button variant="outline" block><MapPin className="size-4" /> Directions</Button>
            </a>
          </div>
          {active && (
            <button
              disabled={busy !== null}
              onClick={() => confirm("Cancel this booking?") && act("cancel", "Booking cancelled")}
              className="w-full py-2 text-sm font-semibold text-rose-600"
            >
              Cancel booking
            </button>
          )}
          {res.status === "seated" && (
            <p className="rounded-2xl bg-surface p-4 text-center text-sm text-muted shadow-card">Scan the QR on your table to order more and pay from your phone.</p>
          )}
        </div>
        <PoweredBy />
      </div>
    </BrandScope>
  );
}
