"use client";

import {
  BarChart3,
  Bell,
  BellOff,
  CalendarCheck,
  ChefHat,
  ClipboardList,
  ExternalLink,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  QrCode,
  Receipt,
  Settings,
  UtensilsCrossed,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { refreshAll } from "@/components/dashboard";
import { PageLoader } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
import { staffFetcher } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { cn, money, REQUEST_LABEL } from "@/lib/format";
import { useHydrated, useRealtime } from "@/lib/hooks";
import { chime, isMuted, setMuted } from "@/lib/sound";
import type { Bill, Order, Restaurant, ServiceRequest, User } from "@/lib/types";

const NAV = [
  { href: "/dashboard", key: "overview", label: "Overview", icon: BarChart3 },
  { href: "/dashboard/orders", key: "orders", label: "Live orders", icon: ClipboardList },
  { href: "/dashboard/kitchen", key: "kitchen", label: "Kitchen display", icon: ChefHat },
  { href: "/dashboard/tables", key: "tables", label: "Tables", icon: LayoutGrid },
  { href: "/dashboard/billing", key: "billing", label: "Billing", icon: Receipt },
  { href: "/dashboard/reservations", key: "reservations", label: "Reservations", icon: CalendarCheck },
  { href: "/dashboard/menu", key: "menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/dashboard/qr", key: "qr", label: "QR codes", icon: QrCode },
  { href: "/dashboard/staff", key: "staff", label: "Staff", icon: Users },
  { href: "/dashboard/settings", key: "settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, user, restaurant, setRestaurant, logout } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [muted, setMutedState] = useState(false);

  useEffect(() => setMutedState(isMuted()), []);
  useEffect(() => {
    if (hydrated && !accessToken) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, accessToken, router, pathname]);
  useEffect(() => setMobileNav(false), [pathname]);

  const { data: me } = useSWR<{ user: User; restaurant: Restaurant }>(accessToken ? "/auth/me" : null, staffFetcher);
  useEffect(() => {
    if (me) setRestaurant(me.restaurant);
  }, [me, setRestaurant]);

  const role = (me?.user ?? user)?.role;
  const { data: active } = useSWR<Order[]>(accessToken ? "/orders?active=true" : null, staffFetcher, { refreshInterval: 60_000 });
  const { data: counter } = useSWR<Bill[]>(accessToken && can(role, "billing") ? "/bills?counter=true" : null, staffFetcher, { refreshInterval: 60_000 });
  const { data: requests } = useSWR<ServiceRequest[]>(accessToken ? "/service-requests?status=open" : null, staffFetcher, { refreshInterval: 60_000 });

  // Realtime: one socket per device; events refresh every SWR key and raise alerts.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRealtime(accessToken ? `/ws/staff?token=${accessToken}` : null, (e) => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => refreshAll(), 250);
    const d = e.data as Record<string, string | number | boolean | null>;
    if (e.type === "order.created" && (d.status === "placed" || d.status === "preparing")) {
      chime("order");
      toast(`New order #${String(d.number).padStart(3, "0")}`, {
        description: d.table_label ? `Table ${d.table_label}` : d.order_type === "delivery" ? "Delivery" : "Takeaway",
        action: { label: "View", onClick: () => router.push(role === "kitchen" ? "/dashboard/kitchen" : "/dashboard/orders") },
      });
    } else if (e.type === "service_request.created") {
      chime("attention");
      toast.warning(`Table ${d.table_label}: ${REQUEST_LABEL[String(d.kind)] ?? "needs help"}`, { action: { label: "Tables", onClick: () => router.push("/dashboard/tables") } });
    } else if (e.type === "bill.updated" && d.pay_preference === "counter" && d.status === "open" && can(role, "billing")) {
      chime("attention");
      toast.info(`${d.table_label ? `Table ${d.table_label}` : "Guest"} is paying at the counter · ${money(Number(d.total))}`, {
        action: { label: "Collect", onClick: () => router.push("/dashboard/billing") },
      });
    } else if (e.type === "payment.succeeded") {
      chime("success");
      toast.success(`Payment received · ${money(Number(d.total))}`, { description: d.table_label ? `Table ${d.table_label}` : undefined });
    } else if (e.type === "reservation.created") {
      toast("New table booking", { action: { label: "View", onClick: () => router.push("/dashboard/reservations") } });
    } else if (e.type === "reservation.updated" && d.on_my_way) {
      chime("attention");
      toast.info(`${d.name} (party of ${d.party_size}) is on the way`, { description: d.fired ? "Pre-order sent to the kitchen" : undefined });
    } else if (e.type === "feedback.created") {
      toast(`New ${d.rating}★ feedback`);
    }
  });

  if (!hydrated || !accessToken) return <PageLoader label="Opening your dashboard…" />;
  const r = me?.restaurant ?? restaurant;

  const badges: Record<string, number> = {
    orders: (active ?? []).filter((o) => o.status === "placed").length,
    kitchen: (active ?? []).filter((o) => o.status === "placed" || o.status === "preparing").length,
    billing: counter?.length ?? 0,
    tables: requests?.length ?? 0,
  };

  // Full-screen kitchen display
  if (pathname === "/dashboard/kitchen") {
    return <div className="min-h-dvh bg-zinc-950">{children}</div>;
  }

  const nav = NAV.filter((n) => can(role, n.key));
  const signOut = () => {
    logout();
    window.location.href = "/login";
  };
  const trialDays = r?.trial_ends_at ? Math.max(0, Math.ceil((new Date(r.trial_ends_at).getTime() - Date.now()) / 86_400_000)) : null;

  const sidebar = (
    <nav className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-2 px-5 py-5">
        <span className="flex size-8 items-center justify-center rounded-xl bg-brand text-sm font-black text-white">D</span>
        <span className="text-lg font-extrabold tracking-tight">DineOS</span>
      </Link>
      <div className="mx-3 mb-3 rounded-xl bg-surface-3 px-3 py-2.5">
        <p className="truncate text-sm font-bold text-fg">{r?.name}</p>
        <p className="text-xs capitalize text-muted">{role} · {r?.plan} plan</p>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map((n) => {
          const activeLink = n.href === "/dashboard" ? pathname === n.href : pathname.startsWith(n.href);
          const Icon = n.icon;
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  activeLink ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-100 dark:bg-brand-100 dark:ring-brand-200" : "text-muted hover:bg-surface-3 hover:text-fg",
                )}
              >
                <Icon className="size-[18px]" />
                <span className="flex-1">{n.label}</span>
                {badges[n.key] > 0 && (
                  <span className={cn("min-w-5 rounded-full px-1.5 text-center text-xs font-bold", activeLink ? "bg-surface text-fg" : n.key === "tables" || n.key === "billing" ? "bg-rose-500 text-white" : "bg-brand text-white")}>
                    {badges[n.key]}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {trialDays !== null && r?.plan_status === "trialing" && can(role, "settings") && (
        <Link href="/dashboard/settings#plan" className="mx-3 mb-2 rounded-xl bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
          <b>{trialDays} days</b> left in your free trial · Choose a plan →
        </Link>
      )}
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex size-9 items-center justify-center rounded-full bg-line text-sm font-bold">{(me?.user ?? user)?.name?.[0]}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{(me?.user ?? user)?.name}</p>
            <p className="truncate text-xs text-muted">{(me?.user ?? user)?.email}</p>
          </div>
          <button onClick={signOut} className="rounded-lg p-2 text-muted hover:bg-surface-3" aria-label="Sign out" title="Sign out"><LogOut className="size-4" /></button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-bg [--brand:#e8590c]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-zinc-950/40" onClick={() => setMobileNav(false)} />
          <aside className="relative h-full w-72 animate-fade-in bg-surface">
            <button className="absolute right-3 top-4 rounded-full p-1.5" onClick={() => setMobileNav(false)} aria-label="Close menu"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:px-8">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu"><MenuIcon className="size-5" /></button>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className={cn("size-2 rounded-full", live === "live" ? "bg-emerald-500" : live === "connecting" ? "animate-pulse bg-amber-400" : "bg-rose-500")} />
            <span className="text-muted">{live === "live" ? "Live" : live === "connecting" ? "Connecting…" : "Offline — retrying"}</span>
          </div>
          <div className="flex-1" />
          {r && (
            <a href={`/r/${r.slug}`} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-surface-3 sm:flex">
              Storefront <ExternalLink className="size-3.5" />
            </a>
          )}
          <ThemeToggle />
          <button
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
              if (muted) chime("order");
            }}
            className="rounded-lg p-2 text-muted hover:bg-surface-3"
            aria-label={muted ? "Unmute alerts" : "Mute alerts"}
            title={muted ? "Alerts muted" : "Sound alerts on"}
          >
            {muted ? <BellOff className="size-5" /> : <Bell className="size-5" />}
          </button>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

