"use client";

import { ArrowLeft, CalendarDays, ChefHat, Minus, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { BrandScope, RestaurantLogo } from "@/components/guest";
import { CartSheet, MenuBrowser } from "@/components/menu";
import { Button, Field, Input, PageLoader, Skeleton, Textarea } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
import { api, publicFetcher } from "@/lib/api";
import { cartTotals, toCartPayload, useCart, useCartLines } from "@/lib/cart";
import { cn, money } from "@/lib/format";
import { guestTokens, useHydrated } from "@/lib/hooks";
import type { Menu, PublicRestaurant, ReservationDetail, Slot } from "@/lib/types";

const OCCASIONS = ["Birthday", "Anniversary", "Date night", "Business", "Family"];

function nextDays(n: number) {
  const out: { iso: string; dow: string; day: string; month: string }[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    out.push({
      iso,
      dow: i === 0 ? "Today" : i === 1 ? "Tmrw" : x.toLocaleDateString("en-IN", { weekday: "short" }),
      day: String(x.getDate()),
      month: x.toLocaleDateString("en-IN", { month: "short" }),
    });
  }
  return out;
}

export default function BookPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const scope = `pre:${slug}`;
  const { data: r } = useSWR<PublicRestaurant>(`/public/restaurants/${slug}`, publicFetcher);
  const { data: menu } = useSWR<Menu>(`/public/restaurants/${slug}/menu`, publicFetcher);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [party, setParty] = useState(2);
  const [days, setDays] = useState<ReturnType<typeof nextDays>>([]);
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [occasion, setOccasion] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lines = useCartLines(scope);
  const clear = useCart((s) => s.clear);
  const preNotes = useCart((s) => s.notes[scope] ?? "");

  useEffect(() => {
    const d = nextDays(14);
    setDays(d);
    setDay(d[0].iso);
  }, []);

  const { data: slots, isLoading } = useSWR<Slot[]>(day ? `/public/restaurants/${slug}/slots?date=${day}&party_size=${party}` : null, publicFetcher);
  useEffect(() => setSlot(null), [day, party]);
  const available = useMemo(() => (slots ?? []).filter((s) => s.available), [slots]);

  if (!r || !hydrated) return <PageLoader />;
  const s = r.settings;
  if (!s.reservations_enabled)
    return <div className="p-10 text-center text-sm text-muted">{r.name} isn&apos;t taking online bookings right now.</div>;

  const { count, subtotal } = cartTotals(lines);

  const confirm = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      const res = await api<ReservationDetail>(`/public/restaurants/${slug}/reservations`, {
        auth: false,
        body: {
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          party_size: party,
          reserved_for: slot.time,
          occasion: occasion ?? undefined,
          notes: notes || undefined,
          preorder_items: toCartPayload(lines),
          preorder_notes: preNotes || undefined,
        },
      });
      guestTokens.set(`reservation:${res.reservation.id}`, res.token!);
      clear(scope);
      router.push(`/r/${slug}/reservation/${res.reservation.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const detailsValid = name.trim().length > 1 && phone.replace(/\D/g, "").length >= 10;

  return (
    <BrandScope color={s.theme_color} className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-xl pb-40">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line-soft bg-surface px-4 py-3">
          <button onClick={() => (step > 1 ? setStep((s) => (s - 1) as 1 | 2) : router.push(`/r/${slug}`))} className="rounded-full p-1.5 hover:bg-surface-3" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <RestaurantLogo r={r} size="sm" />
          <div className="flex-1">
            <p className="font-extrabold leading-tight">Book a table</p>
            <p className="text-xs text-muted">{r.name}</p>
          </div>
          <span className="text-xs font-semibold text-subtle">Step {step}/3</span>
          <ThemeToggle className="-mr-1" />
        </header>
        <div className="h-1 bg-surface-3"><div className="h-full bg-brand transition-all" style={{ width: `${(step / 3) * 100}%` }} /></div>

        {step === 1 && (
          <div className="space-y-4 p-4">
            <section className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="mb-3 flex items-center gap-2 font-bold"><Users className="size-4 text-brand" /> How many guests?</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button className="flex size-11 items-center justify-center rounded-xl border border-line" onClick={() => setParty((p) => Math.max(1, p - 1))} aria-label="Fewer guests"><Minus className="size-4" /></button>
                  <span className="tabular w-8 text-center text-2xl font-extrabold">{party}</span>
                  <button className="flex size-11 items-center justify-center rounded-xl border border-line" onClick={() => setParty((p) => Math.min(s.max_party_size, p + 1))} aria-label="More guests"><Plus className="size-4" /></button>
                </div>
                <span className="text-xs text-muted">Up to {s.max_party_size} online</span>
              </div>
            </section>

            <section className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="mb-3 flex items-center gap-2 font-bold"><CalendarDays className="size-4 text-brand" /> Pick a date</p>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {days.map((d) => (
                  <button key={d.iso} onClick={() => setDay(d.iso)} className={cn("flex w-16 shrink-0 flex-col items-center rounded-2xl border-2 py-2", day === d.iso ? "border-brand bg-brand-50" : "border-line")}>
                    <span className="text-xs font-semibold text-muted">{d.dow}</span>
                    <span className="text-xl font-extrabold">{d.day}</span>
                    <span className="text-xs text-muted">{d.month}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="mb-3 font-bold">Choose a time</p>
              {isLoading ? (
                <div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : slots && slots.length && available.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((sl) => (
                    <button
                      key={sl.time}
                      disabled={!sl.available}
                      onClick={() => setSlot(sl)}
                      className={cn(
                        "rounded-xl border py-2.5 text-sm font-semibold transition",
                        slot?.time === sl.time ? "border-brand bg-brand text-white" : sl.available ? "border-line hover:border-brand/50" : "border-line-soft text-subtle line-through",
                      )}
                    >
                      {sl.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">No tables left for {party} on this day. Try another date or a smaller party.</p>
              )}
            </section>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 p-4">
            <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-card">
              <p className="font-bold">Your details</p>
              <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
              <Field label="Mobile number" hint="We'll send booking updates and your bill here."><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="98765 43210" /></Field>
              <div>
                <p className="mb-1.5 text-sm font-medium text-fg-2">Occasion <span className="text-subtle">(optional)</span></p>
                <div className="flex flex-wrap gap-2">
                  {OCCASIONS.map((o) => (
                    <button key={o} onClick={() => setOccasion(occasion === o ? null : o)} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", occasion === o ? "border-brand bg-brand-50 text-brand-800" : "border-line")}>{o}</button>
                  ))}
                </div>
              </div>
              <Field label="Special requests"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Window seat, high chair, allergies…" /></Field>
            </section>
          </div>
        )}

        {step === 3 && (
          <div className="px-4 pt-4">
            {s.preorder_enabled && menu ? (
              <>
                <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-deep p-4 text-white shadow-float">
                  <p className="flex items-center gap-2 font-extrabold"><ChefHat className="size-5" /> Skip the wait — pre-order</p>
                  <p className="mt-1 text-sm text-white/85">
                    We start cooking just before you arrive, or the moment you tap “I&apos;m on my way”. Totally optional; you pay with your table bill.
                  </p>
                </div>
                <MenuBrowser menu={menu} scope={scope} stickyOffset={61} />
              </>
            ) : (
              <p className="p-6 text-center text-sm text-muted">Review your booking below.</p>
            )}
          </div>
        )}
      </div>

      {/* Footer action */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          {slot && (
            <p className="mb-2 text-center text-sm text-muted">
              <b>{party} guests</b> · {days.find((d) => d.iso === day)?.dow} {days.find((d) => d.iso === day)?.day} {days.find((d) => d.iso === day)?.month} · <b>{slot.label}</b>
              {step === 3 && count > 0 && <> · pre-order {money(subtotal)}</>}
            </p>
          )}
          {step === 1 && <Button block size="xl" disabled={!slot} onClick={() => setStep(2)}>Continue</Button>}
          {step === 2 && <Button block size="xl" disabled={!detailsValid} onClick={() => (s.preorder_enabled ? setStep(3) : confirm())}>{s.preorder_enabled ? "Continue" : "Confirm booking"}</Button>}
          {step === 3 && (
            <div className="flex gap-2">
              {count > 0 && <Button size="xl" variant="outline" onClick={() => setCartOpen(true)}>{count} items</Button>}
              <Button block size="xl" loading={busy} onClick={confirm}>{count > 0 ? "Confirm with pre-order" : "Confirm without food"}</Button>
            </div>
          )}
        </div>
      </div>
      <CartSheet
        scope={scope}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Your pre-order"
        actionLabel="Confirm booking with pre-order"
        onSubmit={() => { setCartOpen(false); void confirm(); }}
        submitting={busy}
        taxNote="Added to your table bill"
      />
    </BrandScope>
  );
}
