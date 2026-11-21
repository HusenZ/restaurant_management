"use client";

import { Check, CreditCard, ExternalLink, MessageCircle, Plus, Radio, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { PageHeader } from "@/components/dashboard";
import { ThemeSwitch } from "@/components/theme";
import { Badge, Button, Card, Field, Input, Segmented, Switch, Textarea } from "@/components/ui";
import { api, staffFetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, money, rupeesToPaise } from "@/lib/format";
import type { Plan, Restaurant, RestaurantSettings, TaxRule } from "@/lib/types";

type Tab = "profile" | "ordering" | "taxes" | "bookings" | "integrations" | "plan";

export default function SettingsPage() {
  const { data: r, mutate } = useSWR<Restaurant>("/restaurant", staffFetcher);
  const setRestaurant = useAuth((s) => s.setRestaurant);
  const [tab, setTab] = useState<Tab>("profile");
  useEffect(() => {
    if (window.location.hash === "#plan") setTab("plan");
  }, []);

  const saveSettings = async (patch: Partial<RestaurantSettings>) => {
    try {
      const updated = await api<Restaurant>("/restaurant/settings", { method: "PATCH", body: patch });
      mutate(updated, { revalidate: false });
      setRestaurant(updated);
      toast.success("Settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!r) return null;
  return (
    <div>
      <PageHeader title="Settings" subtitle={r.name} actions={<a href={`/r/${r.slug}`} target="_blank" rel="noreferrer"><Button variant="outline"><ExternalLink className="size-4" /> View storefront</Button></a>} />
      <div className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "profile", label: "Profile" },
            { value: "ordering", label: "Ordering & payments" },
            { value: "taxes", label: "Taxes & charges" },
            { value: "bookings", label: "Reservations" },
            { value: "integrations", label: "Integrations" },
            { value: "plan", label: "Plan" },
          ]}
        />
      </div>
      {tab === "profile" && <Profile r={r} onSaved={(x) => { mutate(x, { revalidate: false }); setRestaurant(x); }} />}
      {tab === "ordering" && <Ordering s={r.settings} save={saveSettings} />}
      {tab === "taxes" && <Taxes s={r.settings} save={saveSettings} />}
      {tab === "bookings" && <Bookings s={r.settings} save={saveSettings} />}
      {tab === "integrations" && <Integrations />}
      {tab === "plan" && <PlanTab r={r} onChanged={(x) => { mutate(x, { revalidate: false }); setRestaurant(x); }} />}
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div>
        <p className="font-semibold text-fg">{title}</p>
        {desc && <p className="text-sm text-muted">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Profile({ r, onSaved }: { r: Restaurant; onSaved: (r: Restaurant) => void }) {
  const [f, setF] = useState({
    name: r.name, slug: r.slug, tagline: r.tagline ?? "", description: r.description ?? "", phone: r.phone ?? "", email: r.email ?? "",
    whatsapp_number: r.whatsapp_number ?? "", address_line: r.address_line ?? "", city: r.city ?? "", state: r.state ?? "", pincode: r.pincode ?? "",
    gstin: r.gstin ?? "", fssai_number: r.fssai_number ?? "", logo_url: r.logo_url ?? "", cover_url: r.cover_url ?? "", cuisines: r.cuisines.join(", "),
  });
  const [color, setColor] = useState(r.settings.theme_color);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === "cuisines" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v || null]));
      let updated = await api<Restaurant>("/restaurant", { method: "PATCH", body });
      if (color !== r.settings.theme_color) updated = await api<Restaurant>("/restaurant/settings", { method: "PATCH", body: { theme_color: color } });
      onSaved(updated);
      toast.success("Profile saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="space-y-4 p-5 lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Restaurant name"><Input value={f.name} onChange={set("name")} /></Field>
          <Field label="Storefront link" hint={`/r/${f.slug}`}><Input value={f.slug} onChange={set("slug")} /></Field>
        </div>
        <Field label="Tagline"><Input value={f.tagline} onChange={set("tagline")} placeholder="North Indian · Biryani · Tandoor" /></Field>
        <Field label="About"><Textarea rows={2} value={f.description} onChange={set("description")} /></Field>
        <Field label="Cuisines" hint="Comma separated"><Input value={f.cuisines} onChange={set("cuisines")} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
          <Field label="WhatsApp"><Input value={f.whatsapp_number} onChange={set("whatsapp_number")} /></Field>
          <Field label="Email"><Input value={f.email} onChange={set("email")} /></Field>
        </div>
        <Field label="Address"><Input value={f.address_line} onChange={set("address_line")} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City"><Input value={f.city} onChange={set("city")} /></Field>
          <Field label="State"><Input value={f.state} onChange={set("state")} /></Field>
          <Field label="Pincode"><Input value={f.pincode} onChange={set("pincode")} /></Field>
        </div>
        <Button loading={busy} onClick={save}>Save profile</Button>
      </Card>
      <div className="space-y-5">
        <Card className="space-y-3 p-5">
          <p className="font-bold">Invoice compliance</p>
          <Field label="GSTIN" hint="Printed on every tax invoice"><Input value={f.gstin} onChange={set("gstin")} placeholder="27AAAAA0000A1Z5" /></Field>
          <Field label="FSSAI licence no."><Input value={f.fssai_number} onChange={set("fssai_number")} /></Field>
        </Card>
        <Card className="space-y-3 p-5">
          <p className="font-bold">Appearance</p>
          <p className="text-sm text-muted">Dashboard theme on this device. Guests get their phone&apos;s setting and can switch from the menu.</p>
          <ThemeSwitch />
        </Card>
        <Card className="space-y-3 p-5">
          <p className="font-bold">Branding</p>
          <Field label="Theme colour" hint="Used across the guest menu, buttons and invoices">
            <div className="flex items-center gap-2">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-14 cursor-pointer rounded-xl border border-line" />
              <Input value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            {["#E8590C", "#DC2626", "#16A34A", "#0EA5E9", "#7C3AED", "#DB2777", "#0F766E", "#18181B"].map((c) => (
              <button key={c} onClick={() => setColor(c)} className={cn("size-8 rounded-full ring-2 ring-offset-2 ring-offset-surface", color.toLowerCase() === c.toLowerCase() ? "ring-fg" : "ring-transparent")} style={{ background: c }} aria-label={c} />
            ))}
          </div>
          <Field label="Logo URL"><Input value={f.logo_url} onChange={set("logo_url")} placeholder="https://…" /></Field>
          <Field label="Cover image URL"><Input value={f.cover_url} onChange={set("cover_url")} placeholder="https://…" /></Field>
        </Card>
      </div>
    </div>
  );
}

function Ordering({ s, save }: { s: RestaurantSettings; save: (p: Partial<RestaurantSettings>) => void }) {
  const [directions, setDirections] = useState(s.counter_directions);
  const [prep, setPrep] = useState(String(s.avg_prep_minutes));
  const [open, setOpen] = useState(s.opening_time);
  const [close, setClose] = useState(s.closing_time);
  const [fee, setFee] = useState(String(s.delivery_fee / 100));
  const [min, setMin] = useState(String(s.min_delivery_order / 100));
  const toggles: [keyof RestaurantSettings, string, string][] = [
    ["dine_in_enabled", "QR table ordering", "Guests order from the table QR"],
    ["takeaway_enabled", "Takeaway", "Online orders for pickup from your storefront"],
    ["delivery_enabled", "Delivery", "Your own delivery with 0% commission"],
    ["online_payment_enabled", "Online payments", "UPI, cards & wallets via the payment gateway"],
    ["pay_at_counter_enabled", "Pay at counter", "Guests can choose cash/card at the counter"],
    ["auto_accept_orders", "Auto-accept orders", "Send new orders straight to “Preparing”"],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="divide-y divide-line-soft">
        {toggles.map(([key, title, desc]) => (
          <Row key={key} title={title} desc={desc}>
            <Switch checked={Boolean(s[key])} onChange={(v) => save({ [key]: v })} label={title} />
          </Row>
        ))}
      </Card>
      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Opens"><Input type="time" value={open} onChange={(e) => setOpen(e.target.value)} /></Field>
          <Field label="Closes"><Input type="time" value={close} onChange={(e) => setClose(e.target.value)} /></Field>
          <Field label="Avg prep (min)"><Input type="number" value={prep} onChange={(e) => setPrep(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Delivery fee (₹)"><Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
          <Field label="Min. delivery order (₹)"><Input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
        </div>
        <Field label="Directions to the counter" hint="Shown on the guest's “Pay at counter” screen."><Textarea rows={2} value={directions} onChange={(e) => setDirections(e.target.value)} /></Field>
        <Button onClick={() => save({ counter_directions: directions, avg_prep_minutes: Number(prep), opening_time: open, closing_time: close, delivery_fee: rupeesToPaise(fee), min_delivery_order: rupeesToPaise(min) })}>Save</Button>
      </Card>
    </div>
  );
}

function Taxes({ s, save }: { s: RestaurantSettings; save: (p: Partial<RestaurantSettings>) => void }) {
  const [taxes, setTaxes] = useState<TaxRule[]>(s.taxes);
  const [sc, setSc] = useState(String(s.service_charge_percent));
  const [prefix, setPrefix] = useState(s.invoice_prefix);
  const [footer, setFooter] = useState(s.invoice_footer);
  const total = taxes.reduce((a, t) => a + (Number(t.rate) || 0), 0);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <p className="font-bold">Tax lines</p>
          <Badge className="bg-surface-3 text-fg-2 ring-line">Total {total}%</Badge>
        </div>
        {taxes.map((t, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field className="flex-1" label="Name"><Input value={t.name} onChange={(e) => setTaxes(taxes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
            <Field className="w-28" label="Rate %"><Input inputMode="decimal" value={t.rate} onChange={(e) => setTaxes(taxes.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)))} /></Field>
            <Button variant="ghost" onClick={() => setTaxes(taxes.filter((_, j) => j !== i))} aria-label="Remove tax"><Trash2 className="size-4 text-rose-600" /></Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setTaxes([...taxes, { name: "", rate: 0 }])}><Plus className="size-4" /> Add tax</Button>
          <Button size="sm" variant="ghost" onClick={() => setTaxes([{ name: "CGST", rate: 2.5 }, { name: "SGST", rate: 2.5 }])}>Restaurant GST 5%</Button>
          <Button size="sm" variant="ghost" onClick={() => setTaxes([{ name: "CGST", rate: 9 }, { name: "SGST", rate: 9 }])}>Hotel restaurant 18%</Button>
        </div>
        <Row title="Menu prices include tax" desc="Turn on if your printed prices already include GST">
          <Switch checked={s.prices_include_tax} onChange={(v) => save({ prices_include_tax: v })} />
        </Row>
        <Row title="Round off bill total" desc="To the nearest rupee">
          <Switch checked={s.round_off} onChange={(v) => save({ round_off: v })} />
        </Row>
        <Field label="Service charge %" hint="Shown as optional on the bill — guidelines say it can't be mandatory. 0 disables it.">
          <Input inputMode="decimal" value={sc} onChange={(e) => setSc(e.target.value)} />
        </Field>
        <Button onClick={() => save({ taxes: taxes.filter((t) => t.name.trim()), service_charge_percent: Number(sc) || 0 })}>Save taxes</Button>
      </Card>
      <Card className="space-y-4 p-5">
        <p className="font-bold">Invoices</p>
        <Field label="Invoice number prefix" hint={`Next invoice looks like ${prefix || "INV"}/26-27/00001 · resets every financial year`}><Input value={prefix} maxLength={6} onChange={(e) => setPrefix(e.target.value.toUpperCase())} /></Field>
        <Field label="Footer message"><Textarea rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} /></Field>
        <Button onClick={() => save({ invoice_prefix: prefix, invoice_footer: footer })}>Save</Button>
      </Card>
    </div>
  );
}

function Bookings({ s, save }: { s: RestaurantSettings; save: (p: Partial<RestaurantSettings>) => void }) {
  const [f, setF] = useState({
    slot: String(s.reservation_slot_minutes), duration: String(s.reservation_duration_minutes), max: String(s.max_party_size), fire: String(s.preorder_fire_minutes_before),
  });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="divide-y divide-line-soft">
        <Row title="Online table booking" desc="Guests reserve from your storefront"><Switch checked={s.reservations_enabled} onChange={(v) => save({ reservations_enabled: v })} /></Row>
        <Row title="Pre-order with booking" desc="Guests choose food in advance — cooked before they arrive"><Switch checked={s.preorder_enabled} onChange={(v) => save({ preorder_enabled: v })} /></Row>
        <Row title="Auto-confirm bookings" desc="Otherwise each booking waits for your approval"><Switch checked={s.auto_confirm_reservations} onChange={(v) => save({ auto_confirm_reservations: v })} /></Row>
      </Card>
      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slot every (min)"><Input type="number" value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })} /></Field>
          <Field label="Table held for (min)"><Input type="number" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></Field>
          <Field label="Max party online"><Input type="number" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></Field>
          <Field label="Start pre-orders (min before)" hint="Slow dishes start earlier automatically"><Input type="number" value={f.fire} onChange={(e) => setF({ ...f, fire: e.target.value })} /></Field>
        </div>
        <Button onClick={() => save({ reservation_slot_minutes: Number(f.slot), reservation_duration_minutes: Number(f.duration), max_party_size: Number(f.max), preorder_fire_minutes_before: Number(f.fire) })}>Save</Button>
      </Card>
    </div>
  );
}

function Integrations() {
  const { data } = useSWR<{ payments: { provider: string; live: boolean }; whatsapp: { provider: string; live: boolean }; realtime: { broker: string; sockets: number } }>("/restaurant/integrations", staffFetcher);
  const items = [
    { icon: CreditCard, title: "Payments · Razorpay", live: data?.payments.live, desc: data?.payments.live ? "Accepting UPI, cards & wallets" : "Demo gateway active. Add RAZORPAY_KEY_ID / SECRET on the server to go live." },
    { icon: MessageCircle, title: "WhatsApp Cloud API", live: data?.whatsapp.live, desc: data?.whatsapp.live ? "Invoices sent as WhatsApp documents" : "Demo mode: messages are logged; guests can still share via WhatsApp link." },
    { icon: Radio, title: "Realtime", live: true, desc: data ? `${data.realtime.broker} broker · ${data.realtime.sockets} live screens` : "" },
  ];
  return (
    <Card className="divide-y divide-line-soft">
      {items.map((x) => (
        <div key={x.title} className="flex items-center gap-4 px-5 py-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface-3"><x.icon className="size-5" /></span>
          <div className="flex-1">
            <p className="font-semibold">{x.title}</p>
            <p className="text-sm text-muted">{x.desc}</p>
          </div>
          <Badge className={x.live ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/30" : "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/30"}>{x.live ? "Live" : "Demo"}</Badge>
        </div>
      ))}
    </Card>
  );
}

function PlanTab({ r, onChanged }: { r: Restaurant; onChanged: (r: Restaurant) => void }) {
  const { data: plans } = useSWR<Plan[]>("/plans", staffFetcher);
  const [yearly, setYearly] = useState(true);
  const role = useAuth((s) => s.user?.role);
  const choose = async (id: string) => {
    try {
      onChanged(await api<Restaurant>("/restaurant/plan", { body: { plan: id } }));
      toast.success("Plan updated", { description: "Billing checkout connects here (Razorpay Subscriptions) in production." });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Segmented value={yearly ? "y" : "m"} onChange={(v) => setYearly(v === "y")} options={[{ value: "m", label: "Monthly" }, { value: "y", label: "Yearly · save 20%" }]} />
        {r.plan_status === "trialing" && r.trial_ends_at && <span className="text-sm text-muted">Free trial ends {new Date(r.trial_ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {(plans ?? []).map((p) => {
          const current = p.id === r.plan;
          return (
            <Card key={p.id} className={cn("flex flex-col p-6", p.highlight && "ring-2 ring-brand")}>
              <div className="flex items-center justify-between">
                <p className="text-lg font-extrabold">{p.name}</p>
                {current && <Badge className="bg-inverse text-inverse-fg ring-inverse">Current</Badge>}
              </div>
              <p className="text-sm text-muted">{p.tagline}</p>
              <p className="mt-4"><span className="text-3xl font-black">{money(yearly ? Math.round(p.price_yearly / 12 / 100) * 100 : p.price_monthly)}</span><span className="text-muted">/month</span></p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="size-4 shrink-0 text-emerald-600" />{f}</li>)}
              </ul>
              <Button className="mt-6" variant={current ? "outline" : "primary"} disabled={current || role !== "owner"} onClick={() => choose(p.id)}>{current ? "Your plan" : `Switch to ${p.name}`}</Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
