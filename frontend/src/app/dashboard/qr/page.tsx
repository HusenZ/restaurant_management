"use client";

import { Download, ExternalLink, Plus, Printer, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { PageHeader, refreshAll } from "@/components/dashboard";
import { Button, Card, Empty, Field, Input, Segmented, Sheet, Skeleton } from "@/components/ui";
import { api, apiOrigin, openStaffFile, staffFetcher } from "@/lib/api";
import type { Table } from "@/lib/types";

export default function QrPage() {
  const { data: tables, mutate } = useSWR<Table[]>("/tables", staffFetcher);
  const [origin, setOrigin] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const areas = useMemo(() => Array.from(new Set((tables ?? []).map((t) => t.area))), [tables]);
  const qrSrc = (t: Table) => `${apiOrigin()}/api/v1/public/qr/${t.qr_token}.png?base_url=${encodeURIComponent(origin)}`;

  const rotate = async (t: Table) => {
    if (!confirm(`Generate a new QR for ${t.label}? The old printed code will stop working.`)) return;
    await api(`/tables/${t.id}/rotate-qr`, { method: "POST" }).catch((e) => toast.error(e.message));
    mutate();
  };
  const remove = async (t: Table) => {
    if (!confirm(`Delete table ${t.label}?`)) return;
    try {
      await api(`/tables/${t.id}`, { method: "DELETE" });
      mutate();
      refreshAll();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const download = async (t: Table) => {
    const res = await fetch(qrSrc(t));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `table-${t.label}-qr.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div>
      <PageHeader
        title="Tables & QR codes"
        subtitle="Each table gets its own QR. Guests scan to see the menu, order in rounds, call staff and pay."
        actions={
          <>
            <Button variant="outline" onClick={() => setAdding(true)}><Plus className="size-4" /> Add tables</Button>
            <Button onClick={() => openStaffFile(`/tables-qr-sheet.pdf?base_url=${encodeURIComponent(origin)}`).catch((e) => toast.error(e.message))} disabled={!tables?.length}>
              <Printer className="size-4" /> Print table tents (PDF)
            </Button>
          </>
        }
      />
      {origin.includes("localhost") && (
        <p className="mb-4 rounded-xl bg-sky-50 dark:bg-sky-500/10 px-4 py-3 text-sm text-sky-900 dark:text-sky-200">
          Tip: QR codes point to <b>{origin}</b>. To test with your phone, open this dashboard using your computer&apos;s LAN IP (e.g. http://192.168.1.5:3000) and the codes update automatically.
        </p>
      )}
      {!tables ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : tables.length === 0 ? (
        <Empty icon={<QrCode className="size-8" />} title="No tables yet" body="Add tables in bulk — e.g. T1 to T12 in “Indoor”." action={<Button onClick={() => setAdding(true)}>Add tables</Button>} />
      ) : (
        areas.map((area) => (
          <section key={area} className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">{area}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {tables.filter((t) => t.area === area).map((t) => (
                <Card key={t.id} className="p-3 text-center">
                  <p className="text-xl font-black">{t.label}</p>
                  <p className="text-xs text-muted">{t.capacity} seats</p>
                  {origin && <img src={qrSrc(t)} alt={`QR code for table ${t.label}`} className="mx-auto mt-2 aspect-square w-full max-w-40 rounded-lg" loading="lazy" />}
                  <div className="mt-2 flex justify-center gap-1">
                    <a href={`/t/${t.qr_token}`} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted hover:bg-surface-3" title="Open as guest" aria-label="Open as guest"><ExternalLink className="size-4" /></a>
                    <button onClick={() => download(t)} className="rounded-lg p-2 text-muted hover:bg-surface-3" title="Download PNG" aria-label="Download PNG"><Download className="size-4" /></button>
                    <button onClick={() => rotate(t)} className="rounded-lg p-2 text-muted hover:bg-surface-3" title="New QR code" aria-label="New QR code"><RefreshCw className="size-4" /></button>
                    <button onClick={() => remove(t)} className="rounded-lg p-2 text-subtle hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600" title="Delete" aria-label="Delete"><Trash2 className="size-4" /></button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
      <AddTables open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); mutate(); refreshAll(); }} nextNumber={(tables?.length ?? 0) + 1} />
    </div>
  );
}

function AddTables({ open, onClose, onDone, nextNumber }: { open: boolean; onClose: () => void; onDone: () => void; nextNumber: number }) {
  const [mode, setMode] = useState<"bulk" | "single">("bulk");
  const [f, setF] = useState({ prefix: "T", start: String(nextNumber), count: "6", area: "Indoor", capacity: "4", label: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => setF((s) => ({ ...s, start: String(nextNumber) })), [nextNumber]);
  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "bulk") await api("/tables/bulk", { body: { prefix: f.prefix, start: Number(f.start), count: Number(f.count), area: f.area, capacity: Number(f.capacity) } });
      else await api("/tables", { body: { label: f.label, area: f.area, capacity: Number(f.capacity) } });
      toast.success("Tables added — QR codes are ready");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add tables" footer={<Button block size="lg" loading={busy} onClick={submit}>Add</Button>}>
      <Segmented className="w-full" value={mode} onChange={setMode} options={[{ value: "bulk", label: "Several" }, { value: "single", label: "One table" }]} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {mode === "bulk" ? (
          <>
            <Field label="Label prefix"><Input value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} /></Field>
            <Field label="Start number"><Input type="number" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="How many"><Input type="number" min={1} max={100} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
          </>
        ) : (
          <Field label="Table label"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="T9 / Patio 2" /></Field>
        )}
        <Field label="Seats each"><Input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
        <Field label="Area" className="col-span-2"><Input value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="Indoor, Rooftop, Patio…" /></Field>
      </div>
      {mode === "bulk" && <p className="mt-3 text-sm text-muted">Creates {f.prefix}{f.start} … {f.prefix}{Number(f.start) + Number(f.count || 1) - 1}</p>}
    </Sheet>
  );
}
