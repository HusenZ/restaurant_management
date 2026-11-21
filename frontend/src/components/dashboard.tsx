"use client";

import {
  Ban,
  Banknote,
  Bike,
  Check,
  CheckCheck,
  Clock,
  CreditCard,
  Download,
  Flame,
  MessageCircle,
  Percent,
  Plus,
  Receipt,
  ShoppingBag,
  Smartphone,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate as globalMutate } from "swr";
import { api, newClientId, openStaffFile, staffFetcher } from "@/lib/api";
import { toCartPayload, useCart, useCartLines } from "@/lib/cart";
import {
  clock,
  cn,
  minutesSince,
  money,
  pad3,
  REQUEST_LABEL,
  rupeesToPaise,
  timeAgo,
} from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { Bill, Menu, Order, OrderStatus, SessionDetail } from "@/lib/types";
import { BillBreakdown } from "./bill";
import { CartBar, CartSheet, MenuBrowser } from "./menu";
import { Badge, Button, DietIcon, Drawer, Field, Input, PageLoader, Segmented, Sheet, StatusPill } from "./ui";

export const refreshAll = () => globalMutate(() => true);

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- KPI card ---------- */
export function StatCard({ label, value, change, icon, hint }: { label: string; value: React.ReactNode; change?: number | null; icon?: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon && <span className="text-subtle">{icon}</span>}
      </div>
      <p className="tabular mt-2 text-2xl font-extrabold tracking-tight text-fg">{value}</p>
      <div className="mt-1 h-4 text-xs">
        {change !== undefined && change !== null ? (
          <span className={cn("font-semibold", change >= 0 ? "text-emerald-600" : "text-rose-600")}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% <span className="font-normal text-subtle">vs previous period</span>
          </span>
        ) : (
          hint && <span className="text-subtle">{hint}</span>
        )}
      </div>
    </div>
  );
}

/* ---------- Simple bar chart (no chart lib) ---------- */
export function Bars({
  data,
  format,
  height = 180,
  highlightLast,
}: {
  data: { label: string; value: number }[];
  format: (v: number) => string;
  height?: number;
  highlightLast?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const h = Math.max(2, (d.value / max) * (height - 34));
        const last = highlightLast && i === data.length - 1;
        return (
          <div key={i} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span className="tabular invisible whitespace-nowrap text-[10px] font-semibold text-muted group-hover:visible">{format(d.value)}</span>
            <div
              className={cn("w-full max-w-10 rounded-t-md transition-all", last ? "bg-brand" : "bg-brand/25 group-hover:bg-brand/60 dark:bg-brand/40 dark:group-hover:bg-brand/70")}
              style={{ height: h }}
              title={`${d.label}: ${format(d.value)}`}
            />
            <span className="w-full truncate text-center text-[10px] text-subtle">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Age badge ---------- */
export function AgeBadge({ since, now, dark }: { since: string | null; now: number; dark?: boolean }) {
  const m = minutesSince(since, now || undefined);
  const tone = m >= 20 ? "bg-rose-500 text-white" : m >= 10 ? "bg-amber-400 text-amber-950" : dark ? "bg-emerald-500 text-white" : "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  return (
    <span className={cn("tabular inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold", tone)}>
      <Clock className="size-3" /> {m}m
    </span>
  );
}

/* ---------- Order actions ---------- */
type Action = { label: string; status?: OrderStatus; fire?: boolean; variant?: "primary" | "success" | "dark" | "outline" | "danger"; icon: React.ReactNode };

export function nextActions(o: Order): Action[] {
  switch (o.status) {
    case "scheduled":
      return [{ label: "Fire now", fire: true, variant: "primary", icon: <Flame className="size-4" /> }];
    case "placed":
      return [
        { label: "Accept", status: "preparing", variant: "primary", icon: <Check className="size-4" /> },
        { label: "Reject", status: "cancelled", variant: "outline", icon: <Ban className="size-4" /> },
      ];
    case "preparing":
      return [{ label: "Mark ready", status: "ready", variant: "success", icon: <CheckCheck className="size-4" /> }];
    case "ready":
      if (o.order_type === "dine_in") return [{ label: "Served", status: "served", variant: "dark", icon: <UtensilsCrossed className="size-4" /> }];
      if (o.order_type === "delivery") return [{ label: "Out for delivery", status: "out_for_delivery", variant: "dark", icon: <Bike className="size-4" /> }];
      return [{ label: "Picked up", status: "completed", variant: "dark", icon: <ShoppingBag className="size-4" /> }];
    case "out_for_delivery":
      return [{ label: "Delivered", status: "completed", variant: "dark", icon: <Check className="size-4" /> }];
    default:
      return [];
  }
}

export async function runAction(o: Order, a: Action) {
  try {
    if (a.fire) await api(`/orders/${o.id}/fire`, { method: "POST" });
    else {
      let reason: string | undefined;
      if (a.status === "cancelled") {
        const r = window.prompt("Reason for rejecting (shown to the guest)", "Item unavailable");
        if (r === null) return;
        reason = r;
      }
      await api(`/orders/${o.id}/status`, { method: "PATCH", body: { status: a.status, reason } });
    }
    refreshAll();
  } catch (e) {
    toast.error((e as Error).message);
  }
}

export function OrderTypeBadge({ o }: { o: Order }) {
  if (o.order_type === "dine_in")
    return <Badge className="bg-inverse text-inverse-fg ring-inverse">{o.table_label ? `Table ${o.table_label}` : o.source === "reservation" ? "Pre-order" : "Dine-in"}</Badge>;
  if (o.order_type === "delivery") return <Badge className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-500/30"><Bike className="size-3" /> Delivery</Badge>;
  return <Badge className="bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-500/30"><ShoppingBag className="size-3" /> Takeaway</Badge>;
}

export function OrderCard({ o, compact }: { o: Order; compact?: boolean }) {
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const actions = nextActions(o);
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-lg font-black text-fg">{pad3(o.number)}</span>
            <OrderTypeBadge o={o} />
            {o.source === "reservation" && <Badge className="bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-200 dark:ring-violet-500/30">Booking</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {o.customer_name ?? "Guest"} · {o.status === "scheduled" ? `fires ${clock(o.scheduled_for)}` : clock(o.created_at)}
            {o.scheduled_for && o.status !== "scheduled" && o.order_type !== "dine_in" && ` · for ${clock(o.scheduled_for)}`}
          </p>
        </div>
        {["placed", "preparing", "ready"].includes(o.status) ? <AgeBadge since={o.fired_at ?? o.created_at} now={now} /> : <StatusPill status={o.status} />}
      </div>
      <ul className={cn("mt-2.5 space-y-1", compact && "max-h-32 overflow-hidden")}>
        {o.items.map((it) => (
          <li key={it.id} className="flex items-start gap-2 text-sm">
            <DietIcon diet={it.diet} className="mt-0.5" />
            <span className={cn("flex-1", it.is_done && "text-subtle line-through")}>
              <b>{it.quantity}×</b> {it.name}
              {it.modifiers.length > 0 && <span className="block text-xs text-muted">{it.modifiers.map((m) => m.name).join(" · ")}</span>}
              {it.notes && <span className="block text-xs italic text-amber-700 dark:text-amber-300">“{it.notes}”</span>}
            </span>
          </li>
        ))}
      </ul>
      {o.notes && <p className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-200">📝 {o.notes}</p>}
      {actions.length > 0 && (
        <div className="mt-3 flex gap-2">
          {actions.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant={a.variant}
              className={cn(a.variant !== "outline" && "flex-1")}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await runAction(o, a);
                setBusy(false);
              }}
            >
              {a.icon} {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Collect payment at the counter ---------- */
export function CollectDialog({ bill, open, onClose, onDone }: { bill: Bill | null; open: boolean; onClose: () => void; onDone?: (b: Bill) => void }) {
  const [method, setMethod] = useState<"cash" | "upi" | "card">("cash");
  const [tendered, setTendered] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  if (!bill) return null;
  const due = bill.total - bill.amount_paid;
  const tenderedPaise = tendered ? rupeesToPaise(tendered) : due;
  const change = tenderedPaise - due;
  const quick = Array.from(new Set([due, Math.ceil(due / 10000) * 10000, Math.ceil(due / 50000) * 50000, Math.ceil(due / 200000) * 200000])).slice(0, 4);

  const submit = async () => {
    setBusy(true);
    try {
      const paid = await api<Bill>(`/bills/${bill.id}/collect`, {
        body: { method, tendered: method === "cash" ? tenderedPaise : undefined, customer_phone: phone || undefined },
      });
      toast.success(`Payment collected · ${paid.invoice_number}`, { description: method === "cash" && change > 0 ? `Return change ${money(change, { exact: true })}` : undefined });
      setTendered("");
      onDone?.(paid);
      refreshAll();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={<span>Collect payment {bill.table_label ? `· Table ${bill.table_label}` : ""}</span>}
      footer={
        <Button block size="xl" variant="success" loading={busy} disabled={method === "cash" && change < 0} onClick={submit}>
          <Check className="size-5" /> Confirm {money(due, { exact: true })} received
        </Button>
      }
    >
      <div className="rounded-2xl bg-surface-2 p-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Amount due</p>
        <p className="tabular text-4xl font-black">{money(due, { exact: true })}</p>
        <p className="mt-1 font-mono text-xs text-muted">Ref {bill.id.slice(-4).toUpperCase()}</p>
      </div>
      <Segmented
        className="mt-4 w-full"
        value={method}
        onChange={setMethod}
        options={[
          { value: "cash", label: <span className="inline-flex items-center gap-1.5"><Banknote className="size-4" /> Cash</span> },
          { value: "upi", label: <span className="inline-flex items-center gap-1.5"><Smartphone className="size-4" /> UPI</span> },
          { value: "card", label: <span className="inline-flex items-center gap-1.5"><CreditCard className="size-4" /> Card</span> },
        ]}
      />
      {method === "cash" && (
        <div className="mt-4">
          <Field label="Cash received (₹)">
            <Input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={(due / 100).toFixed(0)} className="text-lg font-bold" />
          </Field>
          <div className="mt-2 flex flex-wrap gap-2">
            {quick.map((q) => (
              <button key={q} onClick={() => setTendered(String(q / 100))} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-2">{money(q)}</button>
            ))}
          </div>
          <div className={cn("mt-3 flex items-center justify-between rounded-xl px-4 py-3", change < 0 ? "bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200")}>
            <span className="text-sm font-semibold">{change < 0 ? "Short by" : "Return change"}</span>
            <span className="tabular text-xl font-extrabold">{money(Math.abs(change), { exact: true })}</span>
          </div>
        </div>
      )}
      {method !== "cash" && <p className="mt-4 rounded-xl bg-sky-50 dark:bg-sky-500/10 p-3 text-sm text-sky-900 dark:text-sky-200">Confirm once the {method === "upi" ? "UPI payment shows as received" : "card machine approves"}.</p>}
      <Field className="mt-4" label="Guest WhatsApp (optional)" hint="Used to send the GST invoice.">
        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={bill.customer_phone ?? "98765 43210"} />
      </Field>
    </Sheet>
  );
}

/* ---------- Discount ---------- */
function DiscountDialog({ bill, open, onClose }: { bill: Bill; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<"percent" | "flat">("percent");
  const [value, setValue] = useState("10");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/bills/${bill.id}/discount`, { body: { kind, value: kind === "flat" ? rupeesToPaise(value) : parseFloat(value || "0"), reason: reason || undefined } });
      refreshAll();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Apply discount" footer={<Button block size="lg" loading={busy} onClick={submit}>Apply</Button>}>
      <Segmented className="w-full" value={kind} onChange={setKind} options={[{ value: "percent", label: "Percent %" }, { value: "flat", label: "Flat ₹" }]} />
      <Field className="mt-4" label={kind === "percent" ? "Discount %" : "Discount amount (₹)"}><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
      <Field className="mt-3" label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Regular guest, delay compensation…" /></Field>
      <p className="mt-3 text-xs text-muted">Set 0 to remove a discount. Taxes are recalculated on the discounted amount.</p>
    </Sheet>
  );
}

/* ---------- WhatsApp invoice (staff) ---------- */
export async function sendInvoiceWhatsApp(bill: Bill) {
  const phone = window.prompt("Guest WhatsApp number", bill.customer_phone ?? "");
  if (!phone) return;
  try {
    const res = await api<{ message: string; share_url: string; simulated: boolean }>(`/bills/${bill.id}/whatsapp`, { body: { phone } });
    toast.success(res.message, {
      action: res.simulated ? { label: "Open WhatsApp", onClick: () => window.open(res.share_url, "_blank") } : undefined,
    });
  } catch (e) {
    toast.error((e as Error).message);
  }
}

/* ---------- Staff ordering for a table (waiter-assisted) ---------- */
export function StaffOrderDialog({ tableId, tableLabel, open, onClose }: { tableId: string; tableLabel: string; open: boolean; onClose: () => void }) {
  const scope = `staff:${tableId}`;
  const { data: menu } = useSWR<Menu>(open ? "/menu" : null, staffFetcher);
  const lines = useCartLines(scope);
  const clear = useCart((s) => s.clear);
  const notes = useCart((s) => s.notes[scope] ?? "");
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/orders`, { body: { order_type: "dine_in", table_id: tableId, items: toCartPayload(lines), notes: notes || undefined, client_order_id: newClientId() } });
      clear(scope);
      setCartOpen(false);
      toast.success(`Order sent to kitchen for Table ${tableLabel}`);
      refreshAll();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!open) return null;
  const visibleMenu = menu ? { ...menu, categories: menu.categories.filter((c) => c.is_active).map((c) => ({ ...c, items: c.items.filter((i) => i.is_active) })) } : null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="font-extrabold">Add items · Table {tableLabel}</p>
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-surface-3" aria-label="Close"><X className="size-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4" id="staff-order-scroll">
        <div className="mx-auto max-w-2xl">{visibleMenu ? <MenuBrowser menu={visibleMenu} scope={scope} /> : <PageLoader />}</div>
      </div>
      <CartBar scope={scope} onOpen={() => setCartOpen(true)} label="Review" hint={`Table ${tableLabel}`} />
      <CartSheet scope={scope} open={cartOpen} onClose={() => setCartOpen(false)} title={`Table ${tableLabel}`} actionLabel="Send to kitchen" onSubmit={submit} submitting={busy} />
    </div>
  );
}

/* ---------- Session drawer (table detail) ---------- */
export function SessionDrawer({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const { data, mutate } = useSWR<SessionDetail>(sessionId ? `/sessions/${sessionId}` : null, staffFetcher);
  const [collect, setCollect] = useState(false);
  const [discount, setDiscount] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow(30_000);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await mutate();
      refreshAll();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const bill = data?.bill ?? null;
  const open = !!sessionId;
  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={
          data ? (
            <div>
              <p className="text-xl font-extrabold">Table {data.table.label}</p>
              <p className="text-sm text-muted">
                {data.session.guest_name ? `${data.session.guest_name} · ` : ""}
                {data.session.guest_count} guests · seated {timeAgo(data.session.opened_at, now || undefined)}
                {data.session.reservation_id && " · booking"}
              </p>
            </div>
          ) : (
            "Table"
          )
        }
        footer={
          data && data.session.status !== "closed" ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setAdding(true)}><Plus className="size-4" /> Add items</Button>
              {!bill || bill.status !== "open" ? (
                <Button variant="dark" loading={busy === "bill"} onClick={() => run("bill", () => api(`/sessions/${data.session.id}/bill`, { method: "POST" }))}>
                  <Receipt className="size-4" /> Generate bill
                </Button>
              ) : (
                <Button variant="success" onClick={() => setCollect(true)}><Banknote className="size-4" /> Collect {money(bill.total - bill.amount_paid)}</Button>
              )}
              <Button
                variant="ghost"
                className="col-span-2 text-rose-600"
                loading={busy === "close"}
                onClick={() => confirm("Close this table? Only possible once the bill is settled or nothing was ordered.") && run("close", () => api(`/sessions/${data.session.id}/close`, { method: "POST" }))}
              >
                Close table
              </Button>
            </div>
          ) : undefined
        }
      >
        {!data ? (
          <PageLoader />
        ) : (
          <div className="space-y-5">
            {data.requests.filter((r) => r.status === "open").length > 0 && (
              <div className="space-y-2">
                {data.requests.filter((r) => r.status === "open").map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2.5 ring-1 ring-rose-200 dark:ring-rose-500/30">
                    <span className="text-sm font-semibold text-rose-900 dark:text-rose-200">🔔 {REQUEST_LABEL[r.kind]} · {timeAgo(r.created_at, now || undefined)}</span>
                    <Button size="sm" variant="danger" loading={busy === r.id} onClick={() => run(r.id, () => api(`/service-requests/${r.id}/resolve`, { method: "POST" }))}>Done</Button>
                  </div>
                ))}
              </div>
            )}
            {bill?.pay_preference === "counter" && bill.status === "open" && (
              <div className="rounded-xl bg-violet-50 dark:bg-violet-500/10 px-3 py-2.5 text-sm font-semibold text-violet-900 dark:text-violet-200 ring-1 ring-violet-200 dark:ring-violet-500/30">
                Guest is walking to the counter to pay · Ref {bill.id.slice(-4).toUpperCase()}
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-bold text-fg-2">Rounds ({data.orders.length})</p>
              <div className="space-y-2">
                {data.orders.length === 0 && <p className="text-sm text-muted">No orders yet.</p>}
                {data.orders.map((o) => <OrderCard key={o.id} o={o} compact />)}
              </div>
            </div>

            {bill && (
              <div className="rounded-2xl border border-line p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-bold">Bill {bill.invoice_number ?? <span className="font-mono text-sm text-muted">#{bill.id.slice(-4).toUpperCase()}</span>}</p>
                  <Badge className={bill.status === "paid" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/30" : "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/30"}>{bill.status}</Badge>
                </div>
                <BillBreakdown bill={bill} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {bill.status === "open" && <Button size="sm" variant="outline" onClick={() => setDiscount(true)}><Percent className="size-4" /> Discount</Button>}
                  <Button size="sm" variant="outline" onClick={() => openStaffFile(`/bills/${bill.id}/invoice.pdf`)}><Download className="size-4" /> {bill.status === "paid" ? "Invoice" : "Draft"} PDF</Button>
                  {bill.status === "paid" && <Button size="sm" variant="outline" onClick={() => sendInvoiceWhatsApp(bill)}><MessageCircle className="size-4" /> WhatsApp</Button>}
                </div>
              </div>
            )}
            {!bill && data.running_total > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
                <span className="text-sm text-muted">Running total (pre-tax)</span>
                <span className="tabular font-extrabold">{money(data.running_total)}</span>
              </div>
            )}
          </div>
        )}
      </Drawer>
      <CollectDialog bill={bill} open={collect} onClose={() => setCollect(false)} onDone={() => mutate()} />
      {bill && <DiscountDialog bill={bill} open={discount} onClose={() => setDiscount(false)} />}
      {data && <StaffOrderDialog tableId={data.table.id} tableLabel={data.table.label} open={adding} onClose={() => { setAdding(false); mutate(); }} />}
    </>
  );
}

