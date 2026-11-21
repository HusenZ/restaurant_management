"use client";

import { Banknote, Download, MessageCircle, Receipt, Store } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { CollectDialog, PageHeader, sendInvoiceWhatsApp, SessionDrawer } from "@/components/dashboard";
import { Badge, Button, Card, Empty, Segmented, Skeleton } from "@/components/ui";
import { openStaffFile, staffFetcher } from "@/lib/api";
import { clock, cn, minutesSince, money, ORDER_TYPE_LABEL } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { Bill } from "@/lib/types";

function billTitle(b: Bill) {
  if (b.table_label) return `Table ${b.table_label}`;
  return ORDER_TYPE_LABEL[b.order_type];
}

export default function BillingPage() {
  const [tab, setTab] = useState<"counter" | "open" | "paid">("counter");
  const { data: counter } = useSWR<Bill[]>("/bills?counter=true", staffFetcher, { refreshInterval: 20_000 });
  const { data: open } = useSWR<Bill[]>("/bills?status=open", staffFetcher, { refreshInterval: 30_000 });
  const { data: paid } = useSWR<Bill[]>(tab === "paid" ? "/bills?status=paid&days=1" : null, staffFetcher);
  const [collect, setCollect] = useState<Bill | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const now = useNow(30_000);

  const paidTotal = (paid ?? []).reduce((a, b) => a + b.total, 0);

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle="Settle counter payments, manage open bills and re-send invoices."
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "counter", label: <>At counter {counter?.length ? <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-xs text-white">{counter.length}</span> : null}</> },
              { value: "open", label: `Open (${open?.length ?? 0})` },
              { value: "paid", label: "Paid today" },
            ]}
          />
        }
      />

      {tab === "counter" && (
        !counter ? <Skeleton className="h-40" /> : counter.length === 0 ? (
          <Empty icon={<Store className="size-8" />} title="No one is waiting at the counter" body="When a guest taps “Pay at counter”, they appear here with their bill reference — collect in one tap." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {counter.map((b) => {
              const waited = minutesSince(b.counter_requested_at ?? b.created_at, now || undefined);
              return (
                <Card key={b.id} className={cn("p-5", waited >= 5 && "ring-2 ring-rose-300 dark:ring-rose-500/30")}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xl font-extrabold">{billTitle(b)}</p>
                      <p className="text-sm text-muted">Ref <span className="font-mono font-bold text-fg-2">{b.id.slice(-4).toUpperCase()}</span>{b.customer_name ? ` · ${b.customer_name}` : ""}</p>
                    </div>
                    <Badge className={waited >= 5 ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-500/30" : "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-200 dark:ring-violet-500/30"}>waiting {waited}m</Badge>
                  </div>
                  <p className="tabular mt-4 text-3xl font-black">{money(b.total - b.amount_paid, { exact: true })}</p>
                  <div className="mt-4 flex gap-2">
                    <Button className="flex-1" variant="success" size="lg" onClick={() => setCollect(b)}><Banknote className="size-5" /> Collect</Button>
                    {b.session_id && <Button variant="outline" size="lg" onClick={() => setSessionId(b.session_id)}>Details</Button>}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {tab === "open" && (
        !open ? <Skeleton className="h-40" /> : open.length === 0 ? (
          <Empty icon={<Receipt className="size-8" />} title="No open bills" />
        ) : (
          <Card className="divide-y divide-line-soft">
            {open.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-40 flex-1">
                  <p className="font-bold">{billTitle(b)} <span className="font-mono text-xs text-subtle">#{b.id.slice(-4).toUpperCase()}</span></p>
                  <p className="text-xs text-muted">Opened {clock(b.created_at)}{b.customer_name ? ` · ${b.customer_name}` : ""}</p>
                </div>
                {b.pay_preference && <Badge className={b.pay_preference === "counter" ? "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-200 dark:ring-violet-500/30" : "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-500/30"}>{b.pay_preference === "counter" ? "Pay at counter" : "Paying online"}</Badge>}
                <span className="tabular w-24 text-right font-extrabold">{money(b.total)}</span>
                <div className="flex gap-2">
                  {b.session_id && <Button size="sm" variant="outline" onClick={() => setSessionId(b.session_id)}>Open table</Button>}
                  <Button size="sm" variant="success" onClick={() => setCollect(b)}>Collect</Button>
                </div>
              </div>
            ))}
          </Card>
        )
      )}

      {tab === "paid" && (
        !paid ? <Skeleton className="h-40" /> : paid.length === 0 ? (
          <Empty icon={<Receipt className="size-8" />} title="No paid bills in the last 24 hours" />
        ) : (
          <>
            <p className="mb-3 text-sm text-muted"><b>{paid.length}</b> invoices · <b>{money(paidTotal)}</b> collected</p>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-subtle">
                  <tr><th className="px-5 py-3">Invoice</th><th>Order</th><th>Paid at</th><th>Method</th><th className="text-right">Amount</th><th className="px-5 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {paid.map((b) => (
                    <tr key={b.id}>
                      <td className="px-5 py-3 font-mono text-xs font-semibold">{b.invoice_number}</td>
                      <td>{billTitle(b)}</td>
                      <td className="text-muted">{clock(b.paid_at)}</td>
                      <td><span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs font-bold uppercase">{b.payment_method}</span></td>
                      <td className="tabular text-right font-bold">{money(b.total, { exact: true })}</td>
                      <td className="px-5 text-right">
                        <div className="inline-flex gap-1">
                          <button className="rounded-lg p-2 text-muted hover:bg-surface-3" title="Invoice PDF" aria-label="Invoice PDF" onClick={() => openStaffFile(`/bills/${b.id}/invoice.pdf`)}><Download className="size-4" /></button>
                          <button className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" title="Send on WhatsApp" aria-label="Send on WhatsApp" onClick={() => sendInvoiceWhatsApp(b)}><MessageCircle className="size-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )
      )}

      <CollectDialog bill={collect} open={!!collect} onClose={() => setCollect(null)} />
      <SessionDrawer sessionId={sessionId} onClose={() => setSessionId(null)} />
    </div>
  );
}
