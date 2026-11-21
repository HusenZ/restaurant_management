"use client";

import { ArrowLeft, Bike, Clock, CreditCard, ShoppingBag, Store } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { BrandScope } from "@/components/guest";
import { ThemeToggle } from "@/components/theme";
import { PaymentGateway } from "@/components/payment";
import { Button, DietIcon, Field, Input, PageLoader, QtyStepper, Segmented, Textarea } from "@/components/ui";
import { api, newClientId, publicFetcher } from "@/lib/api";
import { cartTotals, toCartPayload, useCart, useCartLines } from "@/lib/cart";
import { cn, money } from "@/lib/format";
import { guestTokens, useHydrated } from "@/lib/hooks";
import { estimateTotals } from "@/lib/pricing";
import type { Bill, Checkout, Order, PublicRestaurant } from "@/lib/types";
import { useWebMode } from "@/lib/webmode";

type PlaceResult = { token: string; order: Order; bill: Bill; checkout: Checkout | null };

function pickupSlots(r: PublicRestaurant): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  const start = new Date(now.getTime() + (r.settings.avg_prep_minutes + 15) * 60000);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  for (let i = 0; i < 24; i++) {
    const t = new Date(start.getTime() + i * 15 * 60000);
    out.push({
      value: t.toISOString(),
      label: t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) + (t.getDate() !== now.getDate() ? " (tomorrow)" : ""),
    });
  }
  return out;
}

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const scope = `web:${slug}`;
  const { data: r } = useSWR<PublicRestaurant>(`/public/restaurants/${slug}`, publicFetcher);
  const [mode, setMode] = useWebMode(slug, r);
  const lines = useCartLines(scope);
  const setQty = useCart((s) => s.setQty);
  const clear = useCart((s) => s.clear);
  const notes = useCart((s) => s.notes[scope] ?? "");
  const setNotes = useCart((s) => s.setNotes);

  const [when, setWhen] = useState<"asap" | "later">("asap");
  const [slot, setSlot] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState({ line1: "", landmark: "", pincode: "" });
  const [payMode, setPayMode] = useState<"online" | "counter">("online");
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<PlaceResult | null>(null);
  const clientId = useRef<string | null>(null);

  const slots = useMemo(() => (r ? pickupSlots(r) : []), [r]);

  if (!r || !hydrated) return <PageLoader />;
  const s = r.settings;
  const { count, subtotal } = cartTotals(lines);
  const deliveryFee = mode === "delivery" ? s.delivery_fee : 0;
  const est = estimateTotals(subtotal, s, deliveryFee);
  const belowMin = mode === "delivery" && subtotal < s.min_delivery_order;
  const online = s.online_payment_enabled && (payMode === "online" || !s.pay_at_counter_enabled);

  const finish = (res: PlaceResult) => {
    guestTokens.set(`order:${res.order.id}`, res.token);
    clear(scope);
    router.push(`/r/${slug}/track/${res.order.id}`);
  };

  const place = async () => {
    if (!name.trim() || phone.replace(/\D/g, "").length < 10) return toast.error("Please add your name and a 10-digit phone number");
    if (mode === "delivery" && address.line1.trim().length < 5) return toast.error("Please add your full delivery address");
    if (when === "later" && !slot) return toast.error("Choose a pickup time");
    setPlacing(true);
    clientId.current ??= newClientId();
    try {
      const res = await api<PlaceResult>(`/public/restaurants/${slug}/orders`, {
        auth: false,
        body: {
          order_type: mode,
          items: toCartPayload(lines),
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          notes: notes || undefined,
          scheduled_for: when === "later" ? slot : undefined,
          delivery_address: mode === "delivery" ? { line1: address.line1, landmark: address.landmark || undefined, pincode: address.pincode || undefined } : undefined,
          pay_mode: online ? "online" : "counter",
          client_order_id: clientId.current,
        },
      });
      guestTokens.set(`order:${res.order.id}`, res.token);
      if (res.checkout) setPlaced(res);
      else finish(res);
    } catch (e) {
      toast.error((e as Error).message);
      clientId.current = null;
    } finally {
      setPlacing(false);
    }
  };

  return (
    <BrandScope color={s.theme_color} className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-xl pb-40">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line-soft bg-surface px-4 py-3">
          <Link href={`/r/${slug}`} className="rounded-full p-1.5 hover:bg-surface-3" aria-label="Back to menu"><ArrowLeft className="size-5" /></Link>
          <div>
            <p className="font-extrabold">Checkout</p>
            <p className="text-xs text-muted">{r.name}</p>
          </div>
          <ThemeToggle className="ml-auto" />
        </header>

        {count === 0 ? (
          <div className="p-10 text-center">
            <ShoppingBag className="mx-auto size-10 text-subtle" />
            <p className="mt-3 font-semibold">Your cart is empty</p>
            <Link href={`/r/${slug}`}><Button className="mt-4">Browse the menu</Button></Link>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {(s.takeaway_enabled && s.delivery_enabled) && (
              <Segmented
                value={mode}
                onChange={setMode}
                className="w-full bg-surface ring-1 ring-line"
                options={[
                  { value: "takeaway", label: <span className="inline-flex items-center gap-1.5"><ShoppingBag className="size-4" /> Takeaway</span> },
                  { value: "delivery", label: <span className="inline-flex items-center gap-1.5"><Bike className="size-4" /> Delivery</span> },
                ]}
              />
            )}

            <section className="rounded-2xl bg-surface p-4 shadow-card">
              <ul className="divide-y divide-line-soft">
                {lines.map((l) => (
                  <li key={l.key} className="flex items-start gap-3 py-2.5">
                    <DietIcon diet={l.diet} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{l.name}</p>
                      {l.option_labels.length > 0 && <p className="text-xs text-muted">{l.option_labels.join(" · ")}</p>}
                    </div>
                    <QtyStepper size="sm" value={l.quantity} onChange={(v) => setQty(scope, l.key, v)} />
                    <span className="tabular w-16 text-right text-sm font-semibold">{money(l.unit_price * l.quantity)}</span>
                  </li>
                ))}
              </ul>
              <Textarea rows={2} className="mt-2" value={notes} onChange={(e) => setNotes(scope, e.target.value)} placeholder="Note for the kitchen (optional)" />
            </section>

            <section className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="mb-3 flex items-center gap-2 font-bold"><Clock className="size-4 text-brand" /> {mode === "delivery" ? "Delivery time" : "Pickup time"}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["asap", "later"] as const).map((w) => (
                  <button key={w} onClick={() => setWhen(w)} className={cn("rounded-xl border-2 px-3 py-2.5 text-left text-sm", when === w ? "border-brand bg-brand-50" : "border-line")}>
                    <span className="block font-bold">{w === "asap" ? "As soon as possible" : "Schedule"}</span>
                    <span className="text-xs text-muted">{w === "asap" ? `Ready in ~${s.avg_prep_minutes} min` : "Pick a time"}</span>
                  </button>
                ))}
              </div>
              {when === "later" && (
                <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
                  {slots.map((sl) => (
                    <button key={sl.value} onClick={() => setSlot(sl.value)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold", slot === sl.value ? "border-brand bg-brand text-white" : "border-line")}>
                      {sl.label}
                    </button>
                  ))}
                </div>
              )}
              {!r.is_open_now && when === "asap" && (
                <p className="mt-2 text-xs font-medium text-rose-600">The restaurant is closed right now — please schedule for later.</p>
              )}
            </section>

            <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-card">
              <p className="font-bold">Your details</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
                <Field label="Phone"><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="98765 43210" /></Field>
              </div>
              {mode === "delivery" && (
                <>
                  <Field label="Delivery address"><Textarea rows={2} value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} autoComplete="street-address" placeholder="Flat, building, street" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Landmark"><Input value={address.landmark} onChange={(e) => setAddress({ ...address, landmark: e.target.value })} /></Field>
                    <Field label="Pincode"><Input inputMode="numeric" value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value })} autoComplete="postal-code" /></Field>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="mb-3 font-bold">Payment</p>
              <div className="space-y-2">
                {s.online_payment_enabled && (
                  <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3", online ? "border-brand bg-brand-50" : "border-line")}>
                    <input type="radio" name="pay" checked={online} onChange={() => setPayMode("online")} className="accent-[var(--brand)]" />
                    <CreditCard className="size-5 text-brand" />
                    <span className="flex-1"><span className="block text-sm font-bold">Pay online now</span><span className="text-xs text-muted">UPI, cards, wallets</span></span>
                  </label>
                )}
                {s.pay_at_counter_enabled && (
                  <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3", !online ? "border-brand bg-brand-50" : "border-line")}>
                    <input type="radio" name="pay" checked={!online} onChange={() => setPayMode("counter")} className="accent-[var(--brand)]" />
                    <Store className="size-5 text-brand" />
                    <span className="flex-1"><span className="block text-sm font-bold">{mode === "delivery" ? "Pay on delivery" : "Pay at pickup"}</span><span className="text-xs text-muted">Cash, card or UPI</span></span>
                  </label>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-surface p-4 text-sm shadow-card">
              <div className="space-y-1.5 text-muted">
                <div className="flex justify-between"><span>Item total</span><span className="tabular">{money(subtotal)}</span></div>
                {est.serviceCharge > 0 && <div className="flex justify-between"><span>Service charge</span><span className="tabular">{money(est.serviceCharge, { exact: true })}</span></div>}
                <div className="flex justify-between"><span>Taxes ({s.taxes.map((t) => t.name).join(" + ") || "GST"})</span><span className="tabular">{money(est.tax, { exact: true })}</span></div>
                {deliveryFee > 0 && <div className="flex justify-between"><span>Delivery fee</span><span className="tabular">{money(deliveryFee)}</span></div>}
                {est.roundOff !== 0 && <div className="flex justify-between"><span>Round off</span><span className="tabular">{money(est.roundOff, { exact: true })}</span></div>}
              </div>
              <div className="mt-3 flex justify-between border-t border-line-soft pt-3 text-base font-extrabold">
                <span>To pay</span><span className="tabular">{money(est.total)}</span>
              </div>
              {belowMin && <p className="mt-2 text-xs font-semibold text-rose-600">Add {money(s.min_delivery_order - subtotal)} more for delivery</p>}
            </section>
          </div>
        )}
      </div>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-xl">
            <Button block size="xl" loading={placing} disabled={belowMin} onClick={place}>
              {online ? `Pay ${money(est.total)} & place order` : `Place order · ${money(est.total)}`}
            </Button>
          </div>
        </div>
      )}

      <PaymentGateway
        checkout={placed?.checkout ?? null}
        guestToken={placed?.token ?? ""}
        prefill={{ name, contact: phone }}
        onPaid={() => placed && finish(placed)}
        onClose={() => placed && finish(placed)}
      />
    </BrandScope>
  );
}
