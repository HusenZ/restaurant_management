import type { Diet, OrderStatus, OrderType } from "./types";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Paise → "₹1,234" (drops .00) */
export function money(paise: number | null | undefined, opts: { exact?: boolean } = {}): string {
  const v = (paise ?? 0) / 100;
  if (!opts.exact && Number.isInteger(v)) return inr0.format(v);
  return inr.format(v);
}

/** Compact for charts: ₹1.2L, ₹45k */
export function moneyShort(paise: number): string {
  const v = paise / 100;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${Math.round(v)}`;
}

export function rupeesToPaise(value: string | number): number {
  const n = typeof value === "number" ? value : parseFloat(value || "0");
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function pad3(n: number): string {
  return `#${String(n).padStart(3, "0")}`;
}

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  scheduled: "Scheduled",
  placed: "New",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  served: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const GUEST_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Waiting for payment",
  scheduled: "Scheduled",
  placed: "Sent to kitchen",
  preparing: "Being prepared",
  ready: "Ready",
  out_for_delivery: "On the way",
  served: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  pending_payment: "bg-surface-3 text-fg-2 ring-line",
  scheduled: "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-200 dark:ring-violet-500/30",
  placed: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-500/30",
  preparing: "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/30",
  ready: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/30",
  out_for_delivery: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-500/30",
  served: "bg-surface-3 text-fg-2 ring-line",
  completed: "bg-surface-3 text-muted ring-line",
  cancelled: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-500/30",
};

export const DIET_LABEL: Record<Diet, string> = { veg: "Veg", non_veg: "Non-veg", egg: "Contains egg", vegan: "Vegan" };

export const REQUEST_LABEL: Record<string, string> = {
  waiter: "Call waiter",
  water: "Water",
  cutlery: "Cutlery / napkins",
  cleaning: "Clean table",
  bill: "Bring the bill",
  payment_help: "Help with payment",
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
