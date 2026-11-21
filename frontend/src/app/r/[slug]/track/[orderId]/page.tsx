"use client";

import { ArrowLeft, Bike, Check, ChefHat, CreditCard, PackageCheck, Phone, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { BillBreakdown, FeedbackBox, InvoiceActions } from "@/components/bill";
import { BrandScope, PoweredBy } from "@/components/guest";
import { PaymentGateway } from "@/components/payment";
import { Button, PageLoader } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
import { api, guestFetcher } from "@/lib/api";
import { clock, cn, money, pad3 } from "@/lib/format";
import { guestTokens, useHydrated, useRealtime } from "@/lib/hooks";
import { chime } from "@/lib/sound";
import type { Bill, Checkout, Order, PublicRestaurant } from "@/lib/types";

type Tracking = { order: Order; bill: Bill | null; restaurant: PublicRestaurant };

function steps(order: Order) {
  const last = order.order_type === "delivery"
    ? [{ key: "out_for_delivery", label: "On the way", icon: Bike }, { key: "completed", label: "Delivered", icon: PackageCheck }]
    : [{ key: "completed", label: "Picked up", icon: PackageCheck }];
  return [
    { key: "placed", label: "Order placed", icon: Check },
    { key: "preparing", label: "Preparing", icon: ChefHat },
    { key: "ready", label: order.order_type === "delivery" ? "Packed" : "Ready for pickup", icon: ShoppingBag },
    ...last,
  ];
}

const RANK: Record<string, number> = { pending_payment: -1, scheduled: 0, placed: 0, preparing: 1, ready: 2, out_for_delivery: 3, completed: 4, served: 4 };

export default function TrackPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const hydrated = useHydrated();
  const [token, setToken] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  useEffect(() => setToken(guestTokens.get(`order:${orderId}`)), [orderId]);

  const { data, mutate } = useSWR<Tracking>(token ? ["/public/orders/me", token] : null, guestFetcher, { refreshInterval: 30_000 });
  useRealtime(token ? `/ws/guest?token=${token}` : null, () => mutate());

  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (prev.current && prev.current !== data.order.status && data.order.status === "ready") {
      chime("success");
      toast.success(data.order.order_type === "delivery" ? "Your order is packed!" : "Your order is ready for pickup!");
    }
    prev.current = data.order.status;
  }, [data]);

  if (!hydrated) return <PageLoader />;
  if (!token)
    return (
      <div className="p-10 text-center">
        <p className="font-semibold">We couldn&apos;t find this order on this device.</p>
        <Link href={`/r/${slug}`} className="mt-3 inline-block text-sm font-semibold text-brand">Back to the menu</Link>
      </div>
    );
  if (!data) return <PageLoader label="Fetching your order…" />;

  const { order, bill, restaurant: r } = data;
  const rank = RANK[order.status] ?? 0;
  const cancelled = order.status === "cancelled";
  const pending = order.status === "pending_payment";
  const st = steps(order);

  const payNow = async () => {
    if (!bill) return;
    try {
      setCheckout(await api<Checkout>(`/public/bills/${bill.id}/pay`, { body: { mode: "online" }, guestToken: token }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <BrandScope color={r.settings.theme_color} className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-xl pb-10">
        <header className="flex items-center gap-3 bg-surface px-4 py-3">
          <Link href={`/r/${slug}`} className="rounded-full p-1.5 hover:bg-surface-3" aria-label="Back"><ArrowLeft className="size-5" /></Link>
          <p className="font-extrabold">{r.name}</p>
          <ThemeToggle className="ml-auto" />
        </header>

        <div className="bg-gradient-to-b from-surface to-bg px-4 pb-6 pt-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-subtle">{order.order_type === "delivery" ? "Delivery order" : "Takeaway token"}</p>
          <p className="mt-1 font-mono text-6xl font-black tracking-tight text-fg">{pad3(order.number)}</p>
          <p className="mt-2 text-sm text-muted">
            {cancelled ? `Cancelled${order.cancel_reason ? ` · ${order.cancel_reason}` : ""}` :
              pending ? "Complete payment to send your order to the kitchen" :
              order.scheduled_for ? `Scheduled for ${clock(order.scheduled_for)}` :
              rank >= 2 ? (order.order_type === "delivery" ? "Packed and leaving soon" : "Ready — show this token at the counter") :
              `Estimated ready by ${clock(new Date(new Date(order.created_at).getTime() + r.settings.avg_prep_minutes * 60000).toISOString())}`}
          </p>
        </div>

        <div className="space-y-3 px-4">
          {pending && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 p-4 ring-1 ring-amber-200 dark:ring-amber-500/30">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Payment pending</p>
              <p className="text-xs text-amber-800 dark:text-amber-300">Unpaid online orders are released after 15 minutes.</p>
              <Button className="mt-3" block onClick={payNow}><CreditCard className="size-4" /> Pay {money(bill?.total)}</Button>
            </div>
          )}

          {!cancelled && !pending && (
            <ol className="rounded-2xl bg-surface p-4 shadow-card">
              {st.map((s, i) => {
                const done = rank >= i;
                const current = rank === i;
                const Icon = s.icon;
                return (
                  <li key={s.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={cn("flex size-9 items-center justify-center rounded-full", done ? "bg-brand text-white" : "bg-surface-3 text-subtle", current && rank < st.length - 1 && "animate-ring text-brand")}>
                        <Icon className={cn("size-4", done && "text-white")} />
                      </span>
                      {i < st.length - 1 && <span className={cn("my-1 h-6 w-0.5", rank > i ? "bg-brand" : "bg-line")} />}
                    </div>
                    <p className={cn("pt-2 text-sm", done ? "font-bold text-fg" : "text-subtle")}>{s.label}</p>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-bold">{order.item_count} items</span>
              <span className="text-muted">Placed {clock(order.created_at)}</span>
            </div>
            {bill && <BillBreakdown bill={bill} />}
            {order.delivery_address && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-xs text-muted">Delivering to: {order.delivery_address.line1}{order.delivery_address.landmark ? `, ${order.delivery_address.landmark}` : ""}</p>}
            {bill && bill.status === "open" && bill.pay_preference === "counter" && (
              <p className="mt-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 p-3 text-xs font-medium text-sky-800 dark:text-sky-300">
                Pay {money(bill.total)} {order.order_type === "delivery" ? "on delivery" : "at pickup"} — cash, card or UPI.
              </p>
            )}
          </div>

          {bill?.status === "paid" && bill.invoice_url && (
            <>
              <InvoiceActions bill={bill} guestToken={token} defaultPhone={order.customer_phone} restaurantName={r.name} />
              {rank >= 4 && <FeedbackBox billId={bill.id} guestToken={token} done={bill.has_feedback} />}
            </>
          )}

          {r.phone && (
            <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-muted">
              <Phone className="size-4" /> Call {r.name}
            </a>
          )}
        </div>
        <PoweredBy />
      </div>
      <PaymentGateway
        checkout={checkout}
        guestToken={token}
        onPaid={() => {
          setCheckout(null);
          mutate();
        }}
        onClose={() => setCheckout(null)}
      />
    </BrandScope>
  );
}
