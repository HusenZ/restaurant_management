"use client";

import { ImagePlus, Pencil, Plus, Search, Trash2, UtensilsCrossed, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { ItemTile } from "@/components/menu";
import { PageHeader, refreshAll } from "@/components/dashboard";
import { Badge, Button, Card, DietIcon, Empty, Field, Input, Select, Sheet, Skeleton, Switch, Textarea } from "@/components/ui";
import { api, staffFetcher } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { cn, DIET_LABEL, money, rupeesToPaise } from "@/lib/format";
import type { Diet, Menu, MenuCategory, MenuItem } from "@/lib/types";

const TAGS = [
  { value: "bestseller", label: "★ Bestseller" },
  { value: "chef_special", label: "Chef's special" },
  { value: "new", label: "New" },
  { value: "spicy", label: "Spicy" },
];

export default function MenuPage() {
  const { data: menu, mutate } = useSWR<Menu>("/menu", staffFetcher);
  const role = useAuth((s) => s.user?.role);
  const manager = role === "owner" || role === "manager";
  const [catId, setCatId] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null);
  const [catEditing, setCatEditing] = useState<Partial<MenuCategory> | null>(null);

  const items = useMemo(() => {
    if (!menu) return [];
    const q = query.trim().toLowerCase();
    return menu.categories
      .filter((c) => catId === "all" || c.id === catId)
      .flatMap((c) => c.items.map((i) => ({ ...i, _icon: c.icon, _cat: c.name })))
      .filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [menu, catId, query]);

  const toggle = async (item: MenuItem, value: boolean) => {
    mutate(
      (m) => m && { ...m, categories: m.categories.map((c) => ({ ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, is_available: value } : i)) })) },
      { revalidate: false },
    );
    try {
      await api(`/menu/items/${item.id}/availability`, { method: "PATCH", body: { is_available: value } });
      toast.success(`${item.name} ${value ? "back in stock" : "marked sold out"}`);
    } catch (e) {
      toast.error((e as Error).message);
      mutate();
    }
  };

  const total = menu?.categories.reduce((a, c) => a + c.items.length, 0) ?? 0;
  const soldOut = menu?.categories.reduce((a, c) => a + c.items.filter((i) => !i.is_available).length, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Menu"
        subtitle={menu ? `${total} dishes in ${menu.categories.length} categories${soldOut ? ` · ${soldOut} sold out` : ""} · changes go live instantly` : undefined}
        actions={manager && (
          <>
            <Button variant="outline" onClick={() => setCatEditing({ name: "", icon: "🍽️", is_active: true })}><Plus className="size-4" /> Category</Button>
            <Button onClick={() => setEditing({ category_id: catId === "all" ? menu?.categories[0]?.id : catId, diet: "veg", tags: [], modifier_groups: [], is_available: true, is_active: true, prep_minutes: 15, spice_level: 0 })} disabled={!menu?.categories.length}>
              <Plus className="size-4" /> Add dish
            </Button>
          </>
        )}
      />
      {!menu ? <Skeleton className="h-96" /> : menu.categories.length === 0 ? (
        <Empty icon={<UtensilsCrossed className="size-8" />} title="Your menu is empty" body="Start with a category like “Starters”, then add dishes." action={manager && <Button onClick={() => setCatEditing({ name: "", icon: "🥟", is_active: true })}>Add first category</Button>} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <Card className="h-fit p-2">
            <button onClick={() => setCatId("all")} className={cn("flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold", catId === "all" ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-100 dark:bg-brand-100 dark:ring-brand-200" : "hover:bg-surface-3")}>
              All dishes <span className="text-xs opacity-70">{total}</span>
            </button>
            {menu.categories.map((c) => (
              <div key={c.id} className={cn("group flex items-center rounded-xl", catId === c.id ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-100 dark:bg-brand-100 dark:ring-brand-200" : "hover:bg-surface-3")}>
                <button onClick={() => setCatId(c.id)} className="flex flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold">
                  <span>{c.icon}</span>
                  <span className={cn("flex-1 truncate", !c.is_active && "line-through opacity-60")}>{c.name}</span>
                  <span className="text-xs opacity-70">{c.items.length}</span>
                </button>
                {manager && (
                  <button onClick={() => setCatEditing(c)} className="mr-1 rounded-lg p-1.5 opacity-0 transition group-hover:opacity-100" aria-label={`Edit ${c.name}`}><Pencil className="size-3.5" /></button>
                )}
              </div>
            ))}
          </Card>

          <div>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search dishes" className="pl-9" />
            </div>
            <Card className="divide-y divide-line-soft">
              {items.length === 0 && <p className="p-8 text-center text-sm text-muted">No dishes here yet.</p>}
              {items.map((item) => (
                <div key={item.id} className={cn("flex items-center gap-4 px-4 py-3", !item.is_active && "opacity-50")}>
                  <ItemTile item={item} icon={item._icon} className="size-14 shrink-0 rounded-xl text-2xl" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      <DietIcon diet={item.diet} /> <span className="truncate">{item.name}</span>
                      {item.tags.includes("bestseller") && <Badge className="bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/30">Bestseller</Badge>}
                      {!item.is_active && <Badge className="bg-surface-3 text-muted ring-line">Hidden</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {catId === "all" && `${item._cat} · `}{money(item.price)}
                      {item.modifier_groups.length > 0 && ` · ${item.modifier_groups.length} option group${item.modifier_groups.length > 1 ? "s" : ""}`} · {item.prep_minutes} min
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                    <span className="hidden sm:inline">{item.is_available ? "In stock" : "Sold out"}</span>
                    <Switch checked={item.is_available} onChange={(v) => toggle(item, v)} label={`${item.name} availability`} />
                  </label>
                  {manager && <Button size="sm" variant="ghost" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}><Pencil className="size-4" /></Button>}
                </div>
              ))}
            </Card>
            {!can(role, "settings") && <p className="mt-3 text-xs text-muted">Kitchen staff can switch dishes in and out of stock. Ask a manager to edit prices.</p>}
          </div>
        </div>
      )}
      {editing && menu && <ItemEditor item={editing} categories={menu.categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); mutate(); }} />}
      {catEditing && <CategoryEditor cat={catEditing} onClose={() => setCatEditing(null)} onSaved={() => { setCatEditing(null); mutate(); refreshAll(); }} />}
    </div>
  );
}

function CategoryEditor({ cat, onClose, onSaved }: { cat: Partial<MenuCategory>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(cat.name ?? "");
  const [icon, setIcon] = useState(cat.icon ?? "🍽️");
  const [active, setActive] = useState(cat.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      if (cat.id) await api(`/menu/categories/${cat.id}`, { method: "PATCH", body: { name, icon, is_active: active } });
      else await api(`/menu/categories`, { body: { name, icon, is_active: active } });
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!cat.id || !confirm(`Delete “${cat.name}” and all its dishes?`)) return;
    try {
      await api(`/menu/categories/${cat.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Sheet open onClose={onClose} title={cat.id ? "Edit category" : "New category"} footer={
      <div className="flex gap-2">
        {cat.id && <Button variant="ghost" className="text-rose-600" onClick={remove}><Trash2 className="size-4" /></Button>}
        <Button block size="lg" loading={busy} disabled={!name.trim()} onClick={save}>Save</Button>
      </div>
    }>
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <Field label="Icon"><Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="text-center text-xl" /></Field>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Starters" /></Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {["🥟", "🍛", "🍚", "🫓", "🥤", "🍨", "🍕", "🍔", "🥗", "🍜", "☕", "🍰"].map((e) => (
          <button key={e} onClick={() => setIcon(e)} className={cn("size-10 rounded-xl border text-xl", icon === e ? "border-brand bg-brand-50" : "border-line")}>{e}</button>
        ))}
      </div>
      <label className="mt-4 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold">Show on menu <Switch checked={active} onChange={setActive} /></label>
    </Sheet>
  );
}

type GroupDraft = { name: string; min_select: number; max_select: number; options: { name: string; price: string; is_available: boolean; is_default: boolean }[] };

function ItemEditor({ item, categories, onClose, onSaved }: { item: Partial<MenuItem>; categories: MenuCategory[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: item.name ?? "",
    category_id: item.category_id ?? categories[0]?.id,
    price: item.price !== undefined ? String(item.price / 100) : "",
    description: item.description ?? "",
    diet: (item.diet ?? "veg") as Diet,
    tags: item.tags ?? [],
    spice_level: item.spice_level ?? 0,
    prep_minutes: item.prep_minutes ?? 15,
    image_url: item.image_url ?? "",
    is_available: item.is_available ?? true,
    is_active: item.is_active ?? true,
  });
  const [groups, setGroups] = useState<GroupDraft[]>(
    (item.modifier_groups ?? []).map((g) => ({
      name: g.name, min_select: g.min_select, max_select: g.max_select,
      options: g.options.map((o) => ({ name: o.name, price: String(o.price_delta / 100), is_available: o.is_available, is_default: o.is_default })),
    })),
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const res = await api<{ url: string }>("/uploads", { form });
      set("image_url", res.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!f.name.trim() || !f.price) return toast.error("Name and price are required");
    setBusy(true);
    const body = {
      ...f,
      price: rupeesToPaise(f.price),
      image_url: f.image_url || null,
      description: f.description || null,
      modifier_groups: groups.filter((g) => g.name.trim() && g.options.length).map((g) => ({
        name: g.name, min_select: g.min_select, max_select: Math.max(1, g.max_select),
        options: g.options.filter((o) => o.name.trim()).map((o) => ({ name: o.name, price_delta: rupeesToPaise(o.price), is_available: o.is_available, is_default: o.is_default })),
      })),
    };
    try {
      if (item.id) await api(`/menu/items/${item.id}`, { method: "PATCH", body });
      else await api(`/menu/items`, { body });
      toast.success("Saved — live on the menu");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!item.id || !confirm(`Delete “${item.name}”? Past bills keep their copy.`)) return;
    try {
      await api(`/menu/items/${item.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const updateGroup = (i: number, g: Partial<GroupDraft>) => setGroups((gs) => gs.map((x, idx) => (idx === i ? { ...x, ...g } : x)));

  return (
    <Sheet open wide onClose={onClose} title={item.id ? `Edit ${item.name}` : "New dish"} footer={
      <div className="flex gap-2">
        {item.id && <Button variant="ghost" className="text-rose-600" onClick={remove}><Trash2 className="size-4" /> Delete</Button>}
        <Button block size="lg" loading={busy} onClick={save}>Save dish</Button>
      </div>
    }>
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div>
          <label className="relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 text-xs text-muted hover:border-brand">
            {f.image_url ? <img src={f.image_url} alt="" className="absolute inset-0 size-full object-cover" /> : <><ImagePlus className="mb-1 size-6" />{uploading ? "Uploading…" : "Upload photo"}</>}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          {f.image_url && <button className="mt-1 text-xs font-semibold text-rose-600" onClick={() => set("image_url", "")}>Remove photo</button>}
        </div>
        <div className="space-y-3">
          <Field label="Dish name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Paneer Tikka" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)"><Input inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="280" /></Field>
            <Field label="Category">
              <Select value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </div>
      <Field className="mt-3" label="Description"><Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What makes it special?" /></Field>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Diet">
          <Select value={f.diet} onChange={(e) => set("diet", e.target.value as Diet)}>
            {(Object.keys(DIET_LABEL) as Diet[]).map((d) => <option key={d} value={d}>{DIET_LABEL[d]}</option>)}
          </Select>
        </Field>
        <Field label="Spice level">
          <Select value={f.spice_level} onChange={(e) => set("spice_level", Number(e.target.value))}>
            {["None", "Mild", "Medium", "Hot"].map((l, i) => <option key={l} value={i}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Prep time (min)"><Input type="number" min={0} value={f.prep_minutes} onChange={(e) => set("prep_minutes", Number(e.target.value))} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {TAGS.map((t) => {
          const on = f.tags.includes(t.value);
          return <button key={t.value} onClick={() => set("tags", on ? f.tags.filter((x) => x !== t.value) : [...f.tags, t.value])} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", on ? "border-brand bg-brand-50 text-brand-800" : "border-line")}>{t.label}</button>;
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold">In stock <Switch checked={f.is_available} onChange={(v) => set("is_available", v)} /></label>
        <label className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold">Visible on menu <Switch checked={f.is_active} onChange={(v) => set("is_active", v)} /></label>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-bold">Variants & add-ons</p>
          <Button size="sm" variant="outline" onClick={() => setGroups((g) => [...g, { name: "", min_select: 0, max_select: 1, options: [{ name: "", price: "0", is_available: true, is_default: false }] }])}><Plus className="size-4" /> Option group</Button>
        </div>
        {groups.length === 0 && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">e.g. “Portion: Half / Full”, “Add-ons: Extra cheese +₹40”.</p>}
        <div className="space-y-3">
          {groups.map((g, gi) => (
            <div key={gi} className="rounded-2xl border border-line p-3">
              <div className="flex flex-wrap items-end gap-2">
                <Field className="min-w-40 flex-1" label="Group name"><Input value={g.name} onChange={(e) => updateGroup(gi, { name: e.target.value })} placeholder="Portion" /></Field>
                <Field className="w-24" label="Min"><Input type="number" min={0} value={g.min_select} onChange={(e) => updateGroup(gi, { min_select: Number(e.target.value) })} /></Field>
                <Field className="w-24" label="Max"><Input type="number" min={1} value={g.max_select} onChange={(e) => updateGroup(gi, { max_select: Number(e.target.value) })} /></Field>
                <Button variant="ghost" onClick={() => setGroups((gs) => gs.filter((_, i) => i !== gi))} aria-label="Remove group"><Trash2 className="size-4 text-rose-600" /></Button>
              </div>
              <p className="mt-1 text-xs text-muted">{g.min_select > 0 ? "Required" : "Optional"} · guests pick {g.max_select === 1 ? "one" : `up to ${g.max_select}`}</p>
              <div className="mt-2 space-y-2">
                {g.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <Input value={o.name} onChange={(e) => updateGroup(gi, { options: g.options.map((x, i) => (i === oi ? { ...x, name: e.target.value } : x)) })} placeholder="Option name" />
                    <div className="relative w-32 shrink-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">+₹</span>
                      <Input className="pl-8" inputMode="decimal" value={o.price} onChange={(e) => updateGroup(gi, { options: g.options.map((x, i) => (i === oi ? { ...x, price: e.target.value } : x)) })} />
                    </div>
                    <Switch size="sm" label="Available" checked={o.is_available} onChange={(v) => updateGroup(gi, { options: g.options.map((x, i) => (i === oi ? { ...x, is_available: v } : x)) })} />
                    <button onClick={() => updateGroup(gi, { options: g.options.filter((_, i) => i !== oi) })} className="rounded-lg p-2 text-subtle hover:text-rose-600" aria-label="Remove option"><X className="size-4" /></button>
                  </div>
                ))}
                <button onClick={() => updateGroup(gi, { options: [...g.options, { name: "", price: "0", is_available: true, is_default: false }] })} className="text-sm font-semibold text-brand-700">+ Add option</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
