"use client";

import { Download, MessageCircle, Share2, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, money } from "@/lib/format";
import type { Bill } from "@/lib/types";
import { Button, DietIcon, Input, Textarea } from "./ui";

export function BillBreakdown({ bill, compact }: { bill: Bill; compact?: boolean }) {
  const row = (label: React.ReactNode, value: number, cls?: string) => (
    <div className={cn("flex items-baseline justify-between", cls)}>
      <span>{label}</span>
      <span className="tabular">{money(value, { exact: true })}</span>
    </div>
  );
  return (
    <div className="text-sm">
      {!compact && bill.lines && (
        <ul className="mb-3 divide-y divide-dashed divide-line">
          {bill.lines.map((l, i) => (
            <li key={i} className="flex items-start gap-2.5 py-2">
              <DietIcon diet={l.diet} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg">
                  {l.name} <span className="text-subtle">× {l.quantity}</span>
                </p>
                {l.modifiers.length > 0 && <p className="text-xs text-muted">{l.modifiers.join(" · ")}</p>}
              </div>
              <span className="tabular font-medium text-fg">{money(l.line_total, { exact: true })}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1.5 text-muted">
        {row("Item total", bill.subtotal)}
        {bill.discount > 0 && row(<>Discount {bill.discount_reason && <span className="text-xs">({bill.discount_reason})</span>}</>, -bill.discount, "text-emerald-700 dark:text-emerald-300")}
        {bill.service_charge > 0 && row("Service charge (optional)", bill.service_charge)}
        {bill.taxes.map((t) => (
          <div key={t.name} className="flex items-baseline justify-between">
            <span>{t.name} {t.rate}%</span>
            <span className="tabular">{money(t.amount, { exact: true })}</span>
          </div>
        ))}
        {bill.delivery_fee > 0 && row("Delivery fee", bill.delivery_fee)}
        {bill.round_off !== 0 && row("Round off", bill.round_off)}
      </div>
      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3 text-base font-extrabold text-fg">
        <span>{bill.status === "paid" ? "Paid" : "To pay"}</span>
        <span className="tabular text-xl">{money(bill.total, { exact: true })}</span>
      </div>
      {bill.amount_paid > 0 && bill.status !== "paid" && (
        <div className="mt-1 flex justify-between text-sm text-emerald-700 dark:text-emerald-300">
          <span>Already paid</span>
          <span className="tabular">{money(bill.amount_paid)}</span>
        </div>
      )}
    </div>
  );
}

export function InvoiceActions({
  bill,
  guestToken,
  defaultPhone,
  restaurantName,
}: {
  bill: Bill;
  guestToken: string;
  defaultPhone?: string | null;
  restaurantName: string;
}) {
  const [phone, setPhone] = useState(defaultPhone ?? bill.customer_phone ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const shareText = `My bill from ${restaurantName} · ${bill.invoice_number} · ${money(bill.total)}\n${bill.invoice_url}`;

  const sendWhatsApp = async () => {
    if (phone.replace(/\D/g, "").length < 10) return toast.error("Enter a valid 10-digit WhatsApp number");
    setSending(true);
    try {
      const res = await api<{ status: string; simulated: boolean; share_url: string; message: string }>(
        `/public/bills/${bill.id}/whatsapp`,
        { body: { phone }, guestToken },
      );
      setSent(res.share_url);
      if (res.simulated) toast.success("Invoice queued for WhatsApp", { description: "Demo mode — tap “Open WhatsApp” to receive it now." });
      else if (res.status === "sent") toast.success(res.message);
      else toast.error(res.message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Invoice ${bill.invoice_number}`, text: shareText, url: bill.invoice_url ?? undefined });
        return;
      } catch {
        /* cancelled */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  return (
    <div className="space-y-3">
      <a href={bill.invoice_url ? `${bill.invoice_url}&download=1` : "#"} target="_blank" rel="noreferrer" className="block">
        <Button block size="lg" variant="dark">
          <Download className="size-5" /> Download invoice (PDF)
        </Button>
      </a>
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 p-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          <MessageCircle className="size-4" /> Get it on WhatsApp
        </p>
        <div className="flex gap-2">
          <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" className="bg-surface" />
          <Button variant="success" size="lg" loading={sending} onClick={sendWhatsApp}>Send</Button>
        </div>
        {sent && (
          <a href={sent} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-emerald-800 dark:text-emerald-300 underline">
            Open WhatsApp →
          </a>
        )}
      </div>
      <Button block variant="outline" onClick={share}>
        <Share2 className="size-4" /> Share invoice link
      </Button>
    </div>
  );
}

export function FeedbackBox({ billId, guestToken, done }: { billId: string; guestToken: string; done?: boolean }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(!!done);
  const [busy, setBusy] = useState(false);
  if (submitted)
    return <p className="rounded-2xl bg-surface-2 p-4 text-center text-sm font-medium text-muted">Thanks for your feedback! 💛</p>;
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/public/bills/${billId}/feedback`, { body: { rating, comment: comment || undefined }, guestToken });
      setSubmitted(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-center text-sm font-semibold text-fg-2">How was your experience?</p>
      <div className="mt-2 flex justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} className="p-1 transition active:scale-90">
            <Star className={cn("size-8", n <= rating ? "fill-amber-400 text-amber-400" : "text-subtle")} />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <div className="mt-3 space-y-2">
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={rating >= 4 ? "What did you love?" : "What could we do better?"} />
          <Button block loading={busy} onClick={submit}>Submit feedback</Button>
        </div>
      )}
    </div>
  );
}
