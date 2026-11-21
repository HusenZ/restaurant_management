"use client";

import { Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { PageHeader } from "@/components/dashboard";
import { Badge, Button, Card, Field, Input, Select, Sheet, Skeleton, Switch } from "@/components/ui";
import { api, staffFetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { initials, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { Role, User } from "@/lib/types";

const ROLE_INFO: Record<Role, { label: string; tone: string; can: string }> = {
  owner: { label: "Owner", tone: "bg-inverse text-inverse-fg ring-inverse", can: "Everything incl. billing plan" },
  manager: { label: "Manager", tone: "bg-brand-50 text-brand-800 ring-brand-200", can: "Menu, settings, staff, all operations" },
  cashier: { label: "Cashier", tone: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/30", can: "Billing, payments, discounts, tables" },
  waiter: { label: "Waiter", tone: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-500/30", can: "Tables, orders, reservations" },
  kitchen: { label: "Kitchen", tone: "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/30", can: "Kitchen display, stock on/off" },
};

export default function StaffPage() {
  const { data, mutate } = useSWR<User[]>("/staff", staffFetcher);
  const me = useAuth((s) => s.user);
  const [adding, setAdding] = useState(false);
  const now = useNow(60_000);

  const toggle = async (u: User, active: boolean) => {
    try {
      await api(`/staff/${u.id}`, { method: "PATCH", body: { is_active: active } });
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const changeRole = async (u: User, role: Role) => {
    try {
      await api(`/staff/${u.id}`, { method: "PATCH", body: { role } });
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader title="Staff" subtitle="Give every team member their own login. Access is limited by role." actions={<Button onClick={() => setAdding(true)}><Plus className="size-4" /> Add staff</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
          <div key={r} className="rounded-2xl border border-line bg-surface p-3">
            <Badge className={ROLE_INFO[r].tone}>{ROLE_INFO[r].label}</Badge>
            <p className="mt-2 text-xs text-muted">{ROLE_INFO[r].can}</p>
          </div>
        ))}
      </div>
      {!data ? <Skeleton className="h-64" /> : (
        <Card className="divide-y divide-line-soft">
          {data.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <div className="flex size-10 items-center justify-center rounded-full bg-surface-3 font-bold text-fg-2">{initials(u.name)}</div>
              <div className="min-w-48 flex-1">
                <p className="font-semibold">{u.name} {u.id === me?.id && <span className="text-xs text-subtle">(you)</span>}</p>
                <p className="text-xs text-muted">{u.email} · {u.last_login_at ? `active ${timeAgo(u.last_login_at, now || undefined)}` : "never signed in"}</p>
              </div>
              {u.role === "owner" ? (
                <Badge className={ROLE_INFO.owner.tone}><ShieldCheck className="size-3" /> Owner</Badge>
              ) : (
                <>
                  <Select value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)} className="h-9 w-36 text-sm">
                    {(["manager", "cashier", "waiter", "kitchen"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
                  </Select>
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted">{u.is_active ? "Active" : "Disabled"}<Switch checked={u.is_active} onChange={(v) => toggle(u, v)} /></label>
                </>
              )}
            </div>
          ))}
        </Card>
      )}
      <AddStaff open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); mutate(); }} />
    </div>
  );
}

function AddStaff({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "waiter", password: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api("/staff", { body: { ...f, phone: f.phone || undefined } });
      toast.success(`${f.name} can now sign in`, { description: "Share their email and the temporary password with them." });
      setF({ name: "", email: "", phone: "", role: "waiter", password: "" });
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a team member" footer={<Button block size="lg" loading={busy} onClick={submit}>Create login</Button>}>
      <div className="space-y-3">
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email (login)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <Field label="Role">
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {(["manager", "cashier", "waiter", "kitchen"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_INFO[r].label} — {ROLE_INFO[r].can}</option>)}
          </Select>
        </Field>
        <Field label="Temporary password" hint="At least 8 characters."><Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
      </div>
    </Sheet>
  );
}
