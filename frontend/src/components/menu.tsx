"use client";

import { ChefHat, Flame, Search, ShoppingBag, Sparkles, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type CartLine, cartTotals, qtyForItem, useCart, useCartLines } from "@/lib/cart";
import { cn, money } from "@/lib/format";
import { useHydrated } from "@/lib/hooks";
import type { Menu, MenuItem, ModifierGroup } from "@/lib/types";
import { Button, DietIcon, QtyStepper, Sheet, Switch, Textarea } from "./ui";

const TILE_BG: Record<string, string> = {
  veg: "from-emerald-50 dark:from-emerald-500/15 to-lime-100 dark:to-lime-500/10",
  vegan: "from-emerald-50 dark:from-emerald-500/15 to-teal-100 dark:to-teal-500/10",
  non_veg: "from-orange-50 dark:from-orange-500/15 to-rose-100 dark:to-rose-500/10",
  egg: "from-amber-50 dark:from-amber-500/15 to-yellow-100 dark:to-yellow-500/10",
};

export function ItemTile({ item, icon, className }: { item: MenuItem; icon?: string | null; className?: string }) {
  if (item.image_url) {
    return <img src={item.image_url} alt="" loading="lazy" className={cn("object-cover", className)} />;
  }
  return (
    <div className={cn("flex items-center justify-center bg-gradient-to-br text-4xl", TILE_BG[item.diet], className)} aria-hidden>
      <span className="drop-shadow-sm">{icon || "🍽️"}</span>
    </div>
  );
}

function Tags({ item }: { item: MenuItem }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {item.tags.includes("bestseller") && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
          <Star className="size-3 fill-amber-500 text-amber-500" /> Bestseller
        </span>
      )}
      {item.tags.includes("chef_special") && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-100 dark:bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-bold text-violet-700 dark:text-violet-300">
          <ChefHat className="size-3" /> Chef&apos;s special
        </span>
      )}
      {item.tags.includes("new") && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-sky-100 dark:bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300">
          <Sparkles className="size-3" /> New
        </span>
      )}
      {item.spice_level >= 2 && (
        <span className="inline-flex items-center text-[11px] font-semibold text-rose-600" title="Spicy">
          {Array.from({ length: item.spice_level }).map((_, i) => (
            <Flame key={i} className="size-3 fill-rose-500 text-rose-500" />
          ))}
        </span>
      )}
    </div>
  );
}

/* ---------------- Item customisation sheet ---------------- */

function defaultSelection(item: MenuItem): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const g of item.modifier_groups) {
    const defaults = g.options.filter((o) => o.is_default && o.is_available).map((o) => o.id);
    sel[g.id] = defaults.length ? defaults.slice(0, g.max_select) : g.min_select > 0 && g.max_select === 1
      ? [g.options.find((o) => o.is_available)?.id].filter(Boolean) as string[]
      : [];
  }
  return sel;
}

function GroupPicker({ group, selected, onChange }: { group: ModifierGroup; selected: string[]; onChange: (ids: string[]) => void }) {
  const single = group.max_select === 1;
  const required = group.min_select > 0;
  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="flex w-full items-center justify-between">
        <span className="px-1 text-[15px] font-bold text-fg">{group.name}</span>
      </legend>
      <p className="-mt-1 mb-2 text-xs text-muted">
        {required ? (
          <span className="font-semibold text-brand-700">Required · </span>
        ) : (
          "Optional · "
        )}
        {single ? "Choose 1" : `Choose up to ${group.max_select}`}
      </p>
      <div className="divide-y divide-line-soft">
        {group.options.map((o) => {
          const checked = selected.includes(o.id);
          const disabled = !o.is_available || (!single && !checked && selected.length >= group.max_select);
          return (
            <label key={o.id} className={cn("flex cursor-pointer items-center gap-3 py-2.5", disabled && "cursor-not-allowed opacity-50")}>
              <input
                type={single ? "radio" : "checkbox"}
                name={group.id}
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  if (single) onChange([o.id]);
                  else onChange(checked ? selected.filter((x) => x !== o.id) : [...selected, o.id]);
                }}
                className="size-5 accent-[var(--brand)]"
              />
              <span className="flex-1 text-[15px] text-fg-2">{o.name}</span>
              <span className="tabular text-sm text-muted">
                {!o.is_available ? "Sold out" : o.price_delta ? `+${money(o.price_delta)}` : ""}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ItemSheet({
  item,
  icon,
  scope,
  onClose,
  readOnly,
}: {
  item: MenuItem | null;
  icon?: string | null;
  scope: string;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const add = useCart((s) => s.add);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (item) {
      setSelection(defaultSelection(item));
      setQty(1);
      setNotes("");
    }
  }, [item]);

  if (!item) return null;
  const options = item.modifier_groups.flatMap((g) => g.options.filter((o) => (selection[g.id] ?? []).includes(o.id)));
  const unit = item.price + options.reduce((a, o) => a + o.price_delta, 0);
  const missing = item.modifier_groups.find((g) => (selection[g.id]?.length ?? 0) < g.min_select);

  const submit = () => {
    add(scope, {
      menu_item_id: item.id,
      name: item.name,
      diet: item.diet,
      unit_price: unit,
      quantity: qty,
      option_ids: options.map((o) => o.id),
      option_labels: options.map((o) => o.name),
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <DietIcon diet={item.diet} />
          <span>{item.name}</span>
        </div>
      }
      footer={
        readOnly ? undefined : (
          <div className="flex items-center gap-3">
            <QtyStepper value={qty} onChange={(v) => setQty(Math.max(1, v))} min={1} />
            <Button block size="lg" disabled={!!missing || !item.is_available} onClick={submit}>
              {missing ? `Choose ${missing.name.toLowerCase()}` : `Add item · ${money(unit * qty)}`}
            </Button>
          </div>
        )
      }
    >
      <ItemTile item={item} icon={icon} className="mb-4 h-44 w-full rounded-2xl" />
      <Tags item={item} />
      {item.description && <p className="mt-2 text-sm leading-relaxed text-muted">{item.description}</p>}
      <p className="mt-2 text-sm font-semibold text-fg">{money(item.price)}</p>
      <div className="mt-4 space-y-3">
        {item.modifier_groups.map((g) => (
          <GroupPicker key={g.id} group={g} selected={selection[g.id] ?? []} onChange={(ids) => setSelection((s) => ({ ...s, [g.id]: ids }))} />
        ))}
        {!readOnly && (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-fg-2">Cooking instructions</p>
            <Textarea rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. less oil, no onion" />
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------- Item card ---------------- */

function ItemCard({ item, icon, lines, scope, onOpen, canOrder }: {
  item: MenuItem;
  icon?: string | null;
  lines: CartLine[];
  scope: string;
  onOpen: (item: MenuItem) => void;
  canOrder: boolean;
}) {
  const setQty = useCart((s) => s.setQty);
  const add = useCart((s) => s.add);
  const qty = qtyForItem(lines, item.id);
  const customisable = item.modifier_groups.length > 0;
  const soldOut = !item.is_available;

  const inc = () => {
    if (customisable) return onOpen(item);
    add(scope, { menu_item_id: item.id, name: item.name, diet: item.diet, unit_price: item.price, quantity: 1, option_ids: [], option_labels: [] });
  };
  const dec = () => {
    const last = [...lines].reverse().find((l) => l.menu_item_id === item.id);
    if (last) setQty(scope, last.key, last.quantity - 1);
  };

  return (
    <div className={cn("flex gap-4 py-5", soldOut && "opacity-60")}>
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(item)}>
        <div className="mb-1 flex items-center gap-2">
          <DietIcon diet={item.diet} />
          <Tags item={item} />
        </div>
        <h3 className="text-[16px] font-bold leading-snug text-fg">{item.name}</h3>
        <p className="tabular mt-0.5 text-[15px] font-semibold text-fg-2">{money(item.price)}</p>
        {item.description && <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{item.description}</p>}
      </button>
      <div className="relative w-28 shrink-0 sm:w-32">
        <button onClick={() => onOpen(item)} className="block w-full overflow-hidden rounded-2xl" aria-label={`View ${item.name}`}>
          <ItemTile item={item} icon={icon} className="aspect-square w-full" />
        </button>
        {canOrder && (
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
            {soldOut ? (
              <span className="whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted shadow-sm">SOLD OUT</span>
            ) : qty > 0 ? (
              <div className="rounded-lg bg-surface shadow-float">
                <QtyStepper value={qty} onChange={(v) => (v > qty ? inc() : dec())} />
              </div>
            ) : (
              <button
                onClick={inc}
                className="h-9 w-24 rounded-lg border border-brand/30 bg-surface text-sm font-extrabold tracking-wide text-brand-700 shadow-float transition hover:bg-brand-50 active:scale-95"
              >
                ADD
              </button>
            )}
          </div>
        )}
        {canOrder && customisable && !soldOut && <p className="mt-4 text-center text-[10px] font-medium text-subtle">Customisable</p>}
      </div>
    </div>
  );
}

/* ---------------- Menu browser ---------------- */

export function MenuBrowser({
  menu,
  scope,
  canOrder = true,
  stickyOffset = 0,
  header,
}: {
  menu: Menu;
  scope: string;
  canOrder?: boolean;
  stickyOffset?: number;
  header?: React.ReactNode;
}) {
  const hydrated = useHydrated();
  const lines = useCartLines(scope);
  const [query, setQuery] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [active, setActive] = useState<string | null>(menu.categories[0]?.id ?? null);
  const [openItem, setOpenItem] = useState<{ item: MenuItem; icon: string | null } | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setVegOnly(localStorage.getItem("dineos:veg") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const categories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            (!vegOnly || i.diet === "veg" || i.diet === "vegan") &&
            (!q || i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q)),
        ),
      }))
      .filter((c) => c.items.length);
  }, [menu, query, vegOnly]);

  useEffect(() => {
    const sections = categories.map((c) => document.getElementById(`cat-${c.id}`)).filter(Boolean) as HTMLElement[];
    if (!sections.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace("cat-", ""));
      },
      { rootMargin: `-${stickyOffset + 110}px 0px -60% 0px` },
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [categories, stickyOffset]);

  useEffect(() => {
    const chip = chipsRef.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  const jump = (id: string) => {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - stickyOffset - 104, behavior: "smooth" });
  };

  return (
    <div>
      {header}
      <div className="sticky z-20 -mx-4 border-b border-line-soft bg-surface/95 px-4 pb-2 pt-3 backdrop-blur" style={{ top: stickyOffset }}>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes"
              className="h-10 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-8 text-[15px] outline-none focus:border-brand focus:bg-surface"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-subtle" aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-fg-2">
            <DietIcon diet="veg" />
            <span className="hidden sm:inline">Veg only</span>
            <Switch
              size="sm"
              label="Veg only"
              checked={vegOnly}
              onChange={(v) => {
                setVegOnly(v);
                try {
                  localStorage.setItem("dineos:veg", v ? "1" : "0");
                } catch {
                  /* ignore */
                }
              }}
            />
          </label>
        </div>
        <div ref={chipsRef} className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4">
          {categories.map((c) => (
            <button
              key={c.id}
              data-chip={c.id}
              onClick={() => jump(c.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                active === c.id ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-fg-2 hover:border-line-strong",
              )}
            >
              <span>{c.icon}</span>
              {c.name}
              <span className={cn("text-xs", active === c.id ? "text-white/80" : "text-subtle")}>{c.items.length}</span>
            </button>
          ))}
        </div>
      </div>

      {categories.length === 0 && (
        <div className="py-16 text-center text-sm text-muted">
          No dishes match{query ? ` “${query}”` : ""}{vegOnly ? " in veg" : ""}.
        </div>
      )}

      {categories.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} className="pt-5">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-fg">
            <span>{c.icon}</span> {c.name}
            <span className="text-sm font-medium text-subtle">({c.items.length})</span>
          </h2>
          {c.description && <p className="text-sm text-muted">{c.description}</p>}
          <div className="divide-y divide-dashed divide-line">
            {c.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                icon={c.icon}
                lines={hydrated ? lines : []}
                scope={scope}
                canOrder={canOrder}
                onOpen={(it) => setOpenItem({ item: it, icon: c.icon })}
              />
            ))}
          </div>
        </section>
      ))}
      <div className="h-28" />
      <ItemSheet item={openItem?.item ?? null} icon={openItem?.icon} scope={scope} onClose={() => setOpenItem(null)} readOnly={!canOrder} />
    </div>
  );
}

/* ---------------- Cart bar + sheet ---------------- */

export function CartBar({ scope, onOpen, label = "View cart", hint }: { scope: string; onOpen: () => void; label?: string; hint?: string }) {
  const hydrated = useHydrated();
  const lines = useCartLines(scope);
  const { count, subtotal } = cartTotals(lines);
  if (!hydrated || count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button
        onClick={onOpen}
        className="pointer-events-auto mx-auto flex w-full max-w-xl animate-sheet-up items-center justify-between rounded-2xl bg-brand px-4 py-3.5 text-brand-ink shadow-float active:scale-[0.99]"
      >
        <span className="text-left">
          <span className="block text-xs font-semibold uppercase tracking-wide text-white/80">
            {count} item{count > 1 ? "s" : ""} {hint ? `· ${hint}` : "added"}
          </span>
          <span className="tabular text-lg font-extrabold">{money(subtotal)} <span className="text-xs font-medium text-white/80">+ taxes</span></span>
        </span>
        <span className="flex items-center gap-2 text-[15px] font-bold">
          {label} <ShoppingBag className="size-5" />
        </span>
      </button>
    </div>
  );
}

export function CartSheet({
  scope,
  open,
  onClose,
  title = "Your order",
  actionLabel,
  onSubmit,
  submitting,
  extra,
  taxNote = "Taxes are added on the bill",
}: {
  scope: string;
  open: boolean;
  onClose: () => void;
  title?: string;
  actionLabel: string;
  onSubmit: () => void;
  submitting?: boolean;
  extra?: React.ReactNode;
  taxNote?: string;
}) {
  const lines = useCartLines(scope);
  const setQty = useCart((s) => s.setQty);
  const notes = useCart((s) => s.notes[scope] ?? "");
  const setNotes = useCart((s) => s.setNotes);
  const { count, subtotal } = cartTotals(lines);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-muted">{count} items · {taxNote}</span>
            <span className="tabular text-lg font-extrabold text-fg">{money(subtotal)}</span>
          </div>
          <Button block size="xl" loading={submitting} disabled={!count} onClick={onSubmit}>
            {actionLabel}
          </Button>
        </div>
      }
    >
      {lines.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Your cart is empty.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {lines.map((l) => (
            <li key={l.key} className="flex items-start gap-3 py-3">
              <DietIcon diet={l.diet} className="mt-1" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-fg">{l.name}</p>
                {l.option_labels.length > 0 && <p className="text-xs text-muted">{l.option_labels.join(" · ")}</p>}
                {l.notes && <p className="text-xs italic text-muted">“{l.notes}”</p>}
                <p className="tabular mt-0.5 text-sm text-muted">{money(l.unit_price)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <QtyStepper size="sm" value={l.quantity} onChange={(v) => setQty(scope, l.key, v)} />
                <span className="tabular text-sm font-semibold text-fg">{money(l.unit_price * l.quantity)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-semibold text-fg-2">Note for the kitchen</p>
          <Textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(scope, e.target.value)} placeholder="Allergies, spice preference, serve starters first…" />
        </div>
      )}
      {extra}
    </Sheet>
  );
}
