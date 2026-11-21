"use client";

import {
  BellRing,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  GlassWater,
  Hand,
  Minus,
  Plus,
  Receipt,
  Sparkles,
  Store,
  UtensilsCrossed,
  Users,
  Wallet,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { BillBreakdown, FeedbackBox, InvoiceActions } from "@/components/bill";
import { BrandScope, PoweredBy, RestaurantLogo } from "@/components/guest";
import { CartBar, CartSheet, MenuBrowser } from "@/components/menu";
import { PaymentGateway } from "@/components/payment";
import { Button, DietIcon, Input, PageLoader, Sheet, StatusPill, SuccessCheck } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
import { api, ApiError, guestFetcher, newClientId, publicFetcher } from "@/lib/api";
import { toCartPayload, useCart, useCartLines } from "@/lib/cart";
import { clock, cn, GUEST_STATUS_LABEL, money, REQUEST_LABEL } from "@/lib/format";
import { guestTokens, useHydrated, useRealtime } from "@/lib/hooks";
import { chime } from "@/lib/sound";
import type { Bill, Checkout, Menu, OrderStatus, PublicRestaurant, SessionDetail } from "@/lib/types";

type Lookup = {
  restaurant: PublicRestaurant;
  table: { id: string; label: string; area: string; capacity: number };
  active_session: { id: string; guest_count: number; orders_count: number; host: string | null } | null;
};
type Tab = "menu" | "table" | "bill";

const STEPS: OrderStatus[] = ["placed", "preparing", "ready", "served"];

export default function TablePage() {
  const { token: qr } = useParams<{ token: string }>();
  const hydrated = useHydrated();
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);

  useEffect(() => {
    setGuestToken(guestTokens.get(`session:${qr}`));
    setTokenChecked(true);
  }, [qr]);

  const { data: lookup, error: lookupError } = useSWR<Lookup>(`/public/tables/${qr}`, publicFetcher);
  const { data: menu } = useSWR<Menu>(lookup ? `/public/restaurants/${lookup.restaurant.slug}/menu` : null, publicFetcher);

  if (lookupError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
        <UtensilsCrossed className="size-10 text-subtle" />
        <h1 className="text-lg font-bold">This QR code isn&apos;t active</h1>
        <p className="max-w-xs text-sm text-muted">{(lookupError as Error).message}</p>
      </div>
    );
  }
  if (!lookup || !hydrated || !tokenChecked) return <PageLoader label="Opening the menu…" />;

  return (
    <BrandScope color={lookup.restaurant.settings.theme_color} className="min-h-dvh bg-surface">
      {guestToken ? (
        <TableSession
          qr={qr}
          lookup={lookup}
          menu={menu}
          guestToken={guestToken}
          onEnded={() => {
            guestTokens.remove(`session:${qr}`);
            setGuestToken(null);
          }}
        />
      ) : (
        <Welcome
          qr={qr}
          lookup={lookup}
          onJoined={(t) => {
            guestTokens.set(`session:${qr}`, t);
            setGuestToken(t);
          }}
        />
      )}
    </BrandScope>
  );
}

/* ---------------------------------------------------------------- Welcome ---- */

function Welcome({ qr, lookup, onJoined }: { qr: string; lookup: Lookup; onJoined: (token: string) => void }) {
  const [name, setName] = useState("");
  const [guests, setGuests] = useState(2);
  const [busy, setBusy] = useState(false);
  const r = lookup.restaurant;
  const joining = !!lookup.active_session;

  const start = async () => {
    setBusy(true);
    try {
      const res = await api<{ token: string }>(`/public/tables/${qr}/session`, {
        body: { guest_name: name.trim() || undefined, guest_count: joining ? undefined : guests },
        auth: false,
      });
      onJoined(res.token);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hero-glow relative flex min-h-dvh flex-col">
      <ThemeToggle className="absolute right-3 top-3 bg-surface/70 backdrop-blur" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-10">
        <div className="flex items-center gap-3">
          <RestaurantLogo r={r} size="lg" />
          <div>
            <p className="text-sm font-medium text-muted">Welcome to</p>
            <h1 className="text-2xl font-extrabold leading-tight text-fg">{r.name}</h1>
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-line-soft">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">You&apos;re at</p>
              <p className="text-3xl font-extrabold text-fg">Table {lookup.table.label}</p>
              <p className="text-sm text-muted">{lookup.table.area} · seats {lookup.table.capacity}</p>
            </div>
            <div className="flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand">
              <UtensilsCrossed className="size-8" />
            </div>
          </div>

          {joining && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-sky-50 dark:bg-sky-500/10 px-3 py-2.5 text-sm text-sky-900 dark:text-sky-200">
              <Users className="size-4 shrink-0" />
              <span>
                {lookup.active_session!.host ? `${lookup.active_session!.host}'s table` : "Your table"} is already ordering — you&apos;ll
                join the same bill.
              </span>
            </div>
          )}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-fg-2">Your name <span className="text-subtle">(optional)</span></span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="So the staff can greet you" maxLength={60} />
            </label>
            {!joining && (
              <div>
                <span className="mb-1.5 block text-sm font-medium text-fg-2">Guests</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setGuests((g) => Math.max(1, g - 1))} className="flex size-11 items-center justify-center rounded-xl border border-line" aria-label="Fewer guests">
                    <Minus className="size-4" />
                  </button>
                  <span className="tabular w-10 text-center text-xl font-bold">{guests}</span>
                  <button onClick={() => setGuests((g) => Math.min(30, g + 1))} className="flex size-11 items-center justify-center rounded-xl border border-line" aria-label="More guests">
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
          <Button block size="xl" className="mt-6" loading={busy} onClick={start}>
            {joining ? "Join table & view menu" : "Start ordering"}
          </Button>
        </div>

        <ul className="mt-8 grid grid-cols-3 gap-3 text-center text-xs font-medium text-muted">
          {[
            [<ClipboardList key="1" className="size-5" />, "Order from your phone"],
            [<BellRing key="2" className="size-5" />, "Call staff anytime"],
            [<Wallet key="3" className="size-5" />, "Pay here or at counter"],
          ].map(([icon, label], i) => (
            <li key={i} className="flex flex-col items-center gap-2 rounded-2xl bg-surface/70 p-3">
              <span className="text-brand">{icon}</span>
              {label}
            </li>
          ))}
        </ul>
        <div className="mt-auto">
          <PoweredBy />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Session ---- */

function TableSession({
  qr,
  lookup,
  menu,
  guestToken,
  onEnded,
}: {
  qr: string;
  lookup: Lookup;
  menu: Menu | undefined;
  guestToken: string;
  onEnded: () => void;
}) {
  const r = lookup.restaurant;
  const scope = `dine:${qr}`;
  const [tab, setTab] = useState<Tab>("menu");
  const [cartOpen, setCartOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [paying, setPaying] = useState<"online" | "counter" | null>(null);
  const [phone, setPhone] = useState("");
  const lines = useCartLines(scope);
  const clearCart = useCart((s) => s.clear);
  const kitchenNotes = useCart((s) => s.notes[scope] ?? "");
  const clientId = useRef<string | null>(null);

  const { data, error, mutate } = useSWR<SessionDetail>(["/public/sessions/me", guestToken], guestFetcher, {
    refreshInterval: 20_000,
  });

  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) onEnded();
  }, [error, onEnded]);

  // Notify when a round becomes ready / is served
  const prevStatuses = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    for (const o of data.orders) {
      const prev = prevStatuses.current[o.id];
      if (prev && prev !== o.status && o.status === "ready") {
        chime("success");
        toast.success(`Round ${data.orders.indexOf(o) + 1} is ready!`, { description: "Your food is on its way to the table." });
      }
      prevStatuses.current[o.id] = o.status;
    }
  }, [data]);

  useRealtime(`/ws/guest?token=${guestToken}`, () => mutate());

  const onPaid = useCallback(async () => {
    setCheckout(null);
    chime("success");
    await mutate();
  }, [mutate]);

  if (!data) return <PageLoader label="Getting your table ready…" />;

  const { session, orders, bill } = data;
  const liveOrders = orders.filter((o) => o.status !== "cancelled");
  const paid = bill?.status === "paid";

  if (session.status === "closed") {
    if (paid && bill) return <PaidScreen bill={bill} guestToken={guestToken} restaurant={r} phone={phone || bill.customer_phone} onDone={onEnded} />;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <Store className="size-10 text-subtle" />
        <h1 className="text-lg font-bold">This table session has ended</h1>
        <p className="text-sm text-muted">Thanks for visiting {r.name}. Scan again to start a new order.</p>
        <Button onClick={onEnded}>Start a new order</Button>
      </div>
    );
  }

  if (bill && bill.status === "open" && bill.pay_preference === "counter") {
    return (
      <CounterScreen
        bill={bill}
        restaurant={r}
        tableLabel={lookup.table.label}
        onPayOnline={r.settings.online_payment_enabled ? async () => {
          try {
            const c = await api<Checkout>(`/public/bills/${bill.id}/pay`, { body: { mode: "online" }, guestToken });
            setCheckout(c);
          } catch (e) {
            toast.error((e as Error).message);
          }
        } : undefined}
        checkout={<PaymentGateway checkout={checkout} guestToken={guestToken} onPaid={onPaid} onClose={() => setCheckout(null)} />}
      />
    );
  }

  const sendRound = async () => {
    setPlacing(true);
    clientId.current ??= newClientId();
    try {
      await api(`/public/sessions/me/orders`, {
        body: { items: toCartPayload(lines), notes: kitchenNotes || undefined, client_order_id: clientId.current },
        guestToken,
      });
      clearCart(scope);
      clientId.current = null;
      setCartOpen(false);
      setTab("table");
      chime("success");
      toast.success("Order sent to the kitchen 👨‍🍳");
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPlacing(false);
    }
  };

  const requestBill = async () => {
    try {
      await api(`/public/sessions/me/bill`, { method: "POST", guestToken });
      await mutate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const pay = async (mode: "online" | "counter") => {
    if (!bill) return;
    setPaying(mode);
    try {
      const c = await api<Checkout>(`/public/bills/${bill.id}/pay`, {
        body: { mode, customer_phone: phone.trim() || undefined, customer_name: session.guest_name || undefined },
        guestToken,
      });
      if (mode === "online") setCheckout(c);
      await mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPaying(null);
    }
  };

  const activeRounds = liveOrders.filter((o) => ["placed", "preparing", "ready"].includes(o.status)).length;

  return (
    <div className="mx-auto min-h-dvh max-w-xl bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line-soft bg-surface/95 px-4 py-3 backdrop-blur">
        <RestaurantLogo r={r} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold leading-tight text-fg">{r.name}</p>
          <p className="text-xs text-muted">
            Table <span className="font-bold text-fg-2">{lookup.table.label}</span> · {session.guest_count} guest{session.guest_count > 1 ? "s" : ""}
          </p>
        </div>
        <ThemeToggle className="shrink-0" />
        <button
          onClick={() => setCallOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-inverse px-3.5 py-2 text-sm font-semibold text-inverse-fg active:scale-95"
        >
          <BellRing className="size-4" /> Call staff
        </button>
      </header>

      <main className="px-4">
        {tab === "menu" &&
          (menu ? (
            <MenuBrowser
              menu={menu}
              scope={scope}
              stickyOffset={61}
              header={
                liveOrders.length > 0 ? (
                  <button onClick={() => setTab("table")} className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-left">
                    <ChefHat className="size-5 text-brand" />
                    <span className="flex-1 text-sm text-brand-800">
                      <b>{liveOrders.length} round{liveOrders.length > 1 ? "s" : ""}</b> ordered
                      {activeRounds ? ` · ${activeRounds} in the kitchen` : ""}
                    </span>
                    <span className="text-sm font-bold text-brand-700">Track →</span>
                  </button>
                ) : null
              }
            />
          ) : (
            <PageLoader label="Loading menu…" />
          ))}

        {tab === "table" && (
          <div className="pb-32 pt-4">
            <h2 className="text-xl font-extrabold">Your table</h2>
            <p className="text-sm text-muted">Everything ordered from every phone at Table {lookup.table.label}.</p>
            {liveOrders.length === 0 ? (
              <div className="mt-8 rounded-3xl border border-dashed border-line-strong p-8 text-center">
                <p className="font-semibold">Nothing ordered yet</p>
                <p className="mt-1 text-sm text-muted">Pick dishes from the menu and send them to the kitchen.</p>
                <Button className="mt-4" onClick={() => setTab("menu")}>Browse menu</Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {liveOrders.map((o, i) => (
                  <div key={o.id} className="rounded-2xl border border-line p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-fg">
                          Round {i + 1}
                          {o.source === "reservation" && <span className="ml-2 text-xs font-semibold text-violet-600">Pre-order</span>}
                        </p>
                        <p className="text-xs text-muted">{clock(o.created_at)}{o.customer_name ? ` · by ${o.customer_name}` : ""}</p>
                      </div>
                      <StatusPill status={o.status} label={GUEST_STATUS_LABEL[o.status]} />
                    </div>
                    {o.status !== "cancelled" && STEPS.includes(o.status) && (
                      <div className="mt-3 flex gap-1.5" aria-label={`Status: ${GUEST_STATUS_LABEL[o.status]}`}>
                        {STEPS.map((s, idx) => (
                          <span
                            key={s}
                            className={cn(
                              "h-1.5 flex-1 rounded-full",
                              idx <= STEPS.indexOf(o.status) ? "bg-brand" : "bg-line",
                              idx === STEPS.indexOf(o.status) && o.status !== "served" && "animate-pulse",
                            )}
                          />
                        ))}
                      </div>
                    )}
                    <ul className="mt-3 space-y-1.5">
                      {o.items.map((it) => (
                        <li key={it.id} className="flex items-start gap-2 text-sm">
                          <DietIcon diet={it.diet} className="mt-0.5" />
                          <span className="flex-1">
                            <span className="font-medium text-fg-2">{it.quantity} × {it.name}</span>
                            {it.modifiers.length > 0 && <span className="block text-xs text-muted">{it.modifiers.map((m) => m.name).join(" · ")}</span>}
                          </span>
                          <span className="tabular text-muted">{money(it.line_total)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
                  <span className="text-sm text-muted">Running total (before taxes)</span>
                  <span className="tabular text-lg font-extrabold">{money(liveOrders.reduce((a, o) => a + o.subtotal, 0))}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="lg" onClick={() => setTab("menu")}><Plus className="size-4" /> Order more</Button>
                  <Button variant="dark" size="lg" onClick={() => { setTab("bill"); if (!bill) void requestBill(); }}><Receipt className="size-4" /> Get bill</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "bill" && (
          <div className="pb-32 pt-4">
            <h2 className="text-xl font-extrabold">Bill · Table {lookup.table.label}</h2>
            {!bill ? (
              <div className="mt-6 rounded-3xl border border-dashed border-line-strong p-8 text-center">
                {liveOrders.length ? (
                  <>
                    <p className="font-semibold">Ready to pay?</p>
                    <p className="mt-1 text-sm text-muted">We&apos;ll total up every round for your table.</p>
                    <Button className="mt-4" onClick={requestBill}><Receipt className="size-4" /> Generate bill</Button>
                  </>
                ) : (
                  <p className="text-sm text-muted">Your bill will appear here once you order.</p>
                )}
              </div>
            ) : (
              <BillPanel
                bill={bill}
                guests={session.guest_count}
                phone={phone}
                setPhone={setPhone}
                restaurant={r}
                paying={paying}
                onPay={pay}
              />
            )}
          </div>
        )}
      </main>

      {tab === "menu" && <CartBar scope={scope} onOpen={() => setCartOpen(true)} label="Review order" hint={`Table ${lookup.table.label}`} />}
      <CartSheet
        scope={scope}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title={`Order for Table ${lookup.table.label}`}
        actionLabel="Send to kitchen"
        onSubmit={sendRound}
        submitting={placing}
      />
      <CallStaffSheet open={callOpen} onClose={() => setCallOpen(false)} guestToken={guestToken} openKinds={data.requests.filter((x) => x.status === "open").map((x) => x.kind)} onSent={() => mutate()} />
      <PaymentGateway checkout={checkout} guestToken={guestToken} onPaid={onPaid} onClose={() => setCheckout(null)} prefill={{ name: session.guest_name, contact: phone }} />

      {/* Bottom tabs */}
      {!(tab === "menu" && lines.length > 0) && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto grid max-w-xl grid-cols-3">
            {([
              ["menu", "Menu", <UtensilsCrossed key="m" className="size-5" />],
              ["table", "My table", <ClipboardList key="t" className="size-5" />],
              ["bill", "Bill & pay", <Receipt key="b" className="size-5" />],
            ] as const).map(([value, label, icon]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={cn("relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold", tab === value ? "text-brand" : "text-muted")}
              >
                {icon}
                {label}
                {value === "table" && activeRounds > 0 && (
                  <span className="absolute right-[30%] top-1.5 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] text-white">{activeRounds}</span>
                )}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Bill ---- */

function BillPanel({
  bill,
  guests,
  phone,
  setPhone,
  restaurant,
  paying,
  onPay,
}: {
  bill: Bill;
  guests: number;
  phone: string;
  setPhone: (v: string) => void;
  restaurant: PublicRestaurant;
  paying: "online" | "counter" | null;
  onPay: (mode: "online" | "counter") => void;
}) {
  const [split, setSplit] = useState(Math.max(1, guests));
  const due = Math.max(0, bill.total - bill.amount_paid);
  const s = restaurant.settings;
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-3xl border border-line p-4">
        <BillBreakdown bill={bill} />
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
        <div className="text-sm">
          <p className="font-semibold text-fg-2">Split evenly</p>
          <p className="text-muted">{money(Math.ceil(due / split / 100) * 100)} each</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface" onClick={() => setSplit((n) => Math.max(1, n - 1))} aria-label="Fewer people"><Minus className="size-4" /></button>
          <span className="tabular w-6 text-center font-bold">{split}</span>
          <button className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface" onClick={() => setSplit((n) => Math.min(30, n + 1))} aria-label="More people"><Plus className="size-4" /></button>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-fg-2">WhatsApp number for your invoice <span className="text-subtle">(optional)</span></span>
        <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
      </label>

      <div className="space-y-2.5">
        {s.online_payment_enabled && (
          <Button block size="xl" loading={paying === "online"} onClick={() => onPay("online")}>
            <CreditCard className="size-5" /> Pay {money(due, { exact: true })} now · UPI / Card
          </Button>
        )}
        {s.pay_at_counter_enabled && (
          <Button block size="xl" variant="outline" loading={paying === "counter"} onClick={() => onPay("counter")}>
            <CircleDollarSign className="size-5" /> Pay at counter · Cash / Card
          </Button>
        )}
      </div>
      <p className="text-center text-xs text-subtle">Want to add something? Go back to the menu — your bill updates automatically.</p>
    </div>
  );
}

function CounterScreen({
  bill,
  restaurant,
  tableLabel,
  onPayOnline,
  checkout,
}: {
  bill: Bill;
  restaurant: PublicRestaurant;
  tableLabel: string;
  onPayOnline?: () => void;
  checkout: React.ReactNode;
}) {
  const ref = bill.id.slice(-4).toUpperCase();
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand to-brand-deep text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-12 text-center">
        <div className="mx-auto flex size-20 animate-float items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/25">
          <Store className="size-10" />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold">Please pay at the counter</h1>
        <p className="mt-2 text-white/80">{restaurant.settings.counter_directions}</p>

        <div className="mt-8 rounded-3xl bg-surface p-6 text-fg shadow-float">
          <p className="text-xs font-semibold uppercase tracking-widest text-subtle">Show this to the cashier</p>
          <div className="mt-3 flex items-end justify-center gap-6">
            <div>
              <p className="text-xs text-muted">Table</p>
              <p className="text-4xl font-black">{tableLabel}</p>
            </div>
            <div className="h-12 w-px bg-line" />
            <div>
              <p className="text-xs text-muted">Bill ref</p>
              <p className="font-mono text-4xl font-black tracking-wider">{ref}</p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-surface-2 py-3">
            <p className="text-xs text-muted">Amount due</p>
            <p className="tabular text-3xl font-extrabold">{money(bill.total - bill.amount_paid, { exact: true })}</p>
          </div>
          <p className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-muted">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            Waiting for the cashier — this screen updates by itself
          </p>
        </div>

        <p className="mt-6 text-sm text-white/80">Cash, card or UPI accepted at the counter.</p>
        <div className="mt-auto pt-8">
          {onPayOnline && (
            <button onClick={onPayOnline} className="w-full rounded-2xl bg-white/15 py-3.5 text-sm font-semibold ring-1 ring-white/30 transition hover:bg-white/20">
              Changed your mind? Pay online instead
            </button>
          )}
        </div>
      </div>
      {checkout}
    </div>
  );
}

function PaidScreen({
  bill,
  guestToken,
  restaurant,
  phone,
  onDone,
}: {
  bill: Bill;
  guestToken: string;
  restaurant: PublicRestaurant;
  phone?: string | null;
  onDone: () => void;
}) {
  const method = bill.payment_method ? bill.payment_method.toUpperCase() : "";
  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 pb-10 pt-12">
      <div className="flex flex-col items-center text-center">
        <SuccessCheck />
        <h1 className="mt-5 text-2xl font-extrabold">Payment received</h1>
        <p className="tabular mt-1 text-3xl font-black text-fg">{money(bill.total, { exact: true })}</p>
        <p className="mt-1 text-sm text-muted">
          Invoice {bill.invoice_number}{method ? ` · Paid by ${method}` : ""}
        </p>
      </div>
      <div className="mt-8">
        <InvoiceActions bill={bill} guestToken={guestToken} defaultPhone={phone} restaurantName={restaurant.name} />
      </div>
      <div className="mt-6">
        <FeedbackBox billId={bill.id} guestToken={guestToken} done={bill.has_feedback} />
      </div>
      <details className="mt-6 rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold text-fg-2">View bill details</summary>
        <div className="mt-3">
          <BillBreakdown bill={bill} />
        </div>
      </details>
      <p className="mt-8 text-center text-sm text-muted">Thank you for dining at <b>{restaurant.name}</b>. See you again soon! 🙏</p>
      <Button block variant="ghost" className="mt-2" onClick={onDone}>Start a new order</Button>
      <PoweredBy />
    </div>
  );
}

/* ---------------------------------------------------------------- Call staff ---- */

const CALLS = [
  { kind: "waiter", icon: Hand },
  { kind: "water", icon: GlassWater },
  { kind: "cutlery", icon: UtensilsCrossed },
  { kind: "cleaning", icon: Sparkles },
  { kind: "payment_help", icon: CreditCard },
] as const;

function CallStaffSheet({
  open,
  onClose,
  guestToken,
  openKinds,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  guestToken: string;
  openKinds: string[];
  onSent: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useMemo(() => new Set(openKinds), [openKinds]);
  const call = async (kind: string) => {
    setBusy(kind);
    try {
      await api(`/public/sessions/me/requests`, { body: { kind }, guestToken });
      toast.success(`${REQUEST_LABEL[kind]} — staff notified`);
      onSent();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="How can we help?">
      <div className="grid grid-cols-2 gap-3">
        {CALLS.map(({ kind, icon: Icon }) => (
          <button
            key={kind}
            disabled={busy !== null}
            onClick={() => call(kind)}
            className={cn(
              "flex flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition active:scale-[0.98]",
              pending.has(kind) ? "border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10" : "border-line hover:border-brand/50",
            )}
          >
            <Icon className={cn("size-6", pending.has(kind) ? "text-emerald-600" : "text-brand")} />
            <span className="text-sm font-bold text-fg">{REQUEST_LABEL[kind]}</span>
            {pending.has(kind) && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Requested · on the way</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
