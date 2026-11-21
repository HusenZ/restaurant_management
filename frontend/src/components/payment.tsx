"use client";

import { CreditCard, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, money } from "@/lib/format";
import type { Bill, Checkout } from "@/lib/types";
import { Button, Sheet } from "./ui";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Runs the online payment for a checkout. Razorpay when configured on the server, otherwise a
 * clearly-labelled demo gateway so the full flow can be tried locally.
 */
export function PaymentGateway({
  checkout,
  guestToken,
  onPaid,
  onClose,
  prefill,
}: {
  checkout: Checkout | null;
  guestToken: string;
  onPaid: (bill: Bill) => void;
  onClose: () => void;
  prefill?: { name?: string | null; contact?: string | null };
}) {
  const [method, setMethod] = useState<"upi" | "card">("upi");
  const [busy, setBusy] = useState(false);
  const callbacks = useRef({ onPaid, onClose, prefill });
  useEffect(() => {
    callbacks.current = { onPaid, onClose, prefill };
  });

  const razorpayId = checkout?.mode === "online" && checkout.provider === "razorpay" ? checkout.payment_id : null;
  useEffect(() => {
    if (!razorpayId || !checkout) return;
    let cancelled = false;
    void (async () => {
      const ok = await loadRazorpay();
      if (cancelled) return;
      if (!ok || !window.Razorpay) {
        toast.error("Couldn't load the payment window. Check your connection.");
        return callbacks.current.onClose();
      }
      const rzp = new window.Razorpay({
        key: checkout.key_id,
        amount: checkout.amount,
        currency: checkout.currency,
        name: checkout.restaurant_name,
        order_id: checkout.provider_order_id,
        prefill: { name: callbacks.current.prefill?.name ?? "", contact: callbacks.current.prefill?.contact ?? "" },
        theme: { color: getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#E8590C" },
        modal: { ondismiss: () => callbacks.current.onClose() },
        handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const bill = await api<Bill>(`/public/payments/${razorpayId}/verify`, { body: resp, guestToken });
            callbacks.current.onPaid(bill);
          } catch (e) {
            toast.error((e as Error).message);
            callbacks.current.onClose();
          }
        },
      });
      rzp.open();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [razorpayId]);

  if (!checkout || checkout.mode !== "online" || checkout.provider === "razorpay") return null;

  const complete = async (success: boolean) => {
    setBusy(true);
    try {
      const bill = await api<Bill>(`/public/payments/${checkout.payment_id}/mock-complete`, {
        body: { success, method },
        guestToken,
      });
      if (bill.status === "paid") onPaid(bill);
      else {
        toast.error("Payment failed — no money was deducted. Please try again.");
        onClose();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Paying {checkout.restaurant_name}</p>
          <p className="tabular text-2xl font-extrabold">{money(checkout.amount, { exact: true })}</p>
        </div>
      }
      footer={
        <div className="space-y-2">
          <Button block size="xl" loading={busy} onClick={() => complete(true)}>
            <Lock className="size-4" /> Pay {money(checkout.amount, { exact: true })}
          </Button>
          <button onClick={() => complete(false)} disabled={busy} className="w-full py-1 text-xs font-medium text-subtle hover:text-muted">
            Simulate a failed payment
          </button>
        </div>
      }
    >
      <div className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
        Demo payment gateway — connect Razorpay keys on the server to accept real UPI & card payments.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([
          ["upi", "UPI", <Smartphone key="u" className="size-5" />, "GPay · PhonePe · Paytm"],
          ["card", "Card", <CreditCard key="c" className="size-5" />, "Visa · Mastercard · RuPay"],
        ] as const).map(([value, label, icon, hint]) => (
          <button
            key={value}
            onClick={() => setMethod(value)}
            className={cn(
              "rounded-2xl border-2 p-3 text-left transition",
              method === value ? "border-brand bg-brand-50" : "border-line hover:border-line-strong",
            )}
          >
            <span className="flex items-center gap-2 font-bold text-fg">{icon} {label}</span>
            <span className="mt-1 block text-xs text-muted">{hint}</span>
          </button>
        ))}
      </div>
      {method === "upi" ? (
        <div className="mt-4 rounded-2xl border border-line p-4 text-center">
          <div className="mx-auto grid size-32 grid-cols-8 gap-0.5 rounded-xl bg-white p-2 ring-1 ring-line" aria-hidden>
            {Array.from({ length: 64 }).map((_, i) => (
              <span key={i} className={cn("rounded-[1px]", (i * 7 + (i >> 3) * 3) % 5 < 2 ? "bg-zinc-900" : "bg-white")} />
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">Scan with any UPI app, or tap Pay to approve on this phone</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="h-11 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm text-subtle">4111 1111 1111 1111</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-11 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm text-subtle">12 / 30</div>
            <div className="h-11 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm text-subtle">CVV •••</div>
          </div>
        </div>
      )}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
        <ShieldCheck className="size-4 text-emerald-600" /> 100% secure · Payments go directly to the restaurant
      </p>
    </Sheet>
  );
}
