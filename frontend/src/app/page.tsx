import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  Check,
  ChefHat,
  CreditCard,
  LayoutGrid,
  LineChart,
  MessageCircle,
  QrCode,
  Receipt,
  ShoppingBag,
  Store,
  UtensilsCrossed,
  X,
} from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme";

const FEATURES = [
  { icon: QrCode, title: "QR table ordering", body: "Guests scan, browse a beautiful menu and order in rounds from their own phones. Everyone at the table shares one bill." },
  { icon: CreditCard, title: "Pay at table — or at the counter", body: "UPI, cards and wallets in two taps. Prefer cash? A guided counter screen shows the bill ref; the cashier settles in one tap." },
  { icon: CalendarCheck, title: "Booking with pre-cooked food", body: "Guests reserve and pre-order. The kitchen starts before they arrive — or the moment they tap “I'm on my way”." },
  { icon: ShoppingBag, title: "Takeaway & delivery, 0% commission", body: "Your own ordering link for Instagram, Google and WhatsApp. Live token tracking, scheduled pickups, your customer data." },
  { icon: ChefHat, title: "Kitchen display", body: "Tickets with age timers, item strike-through, all-day counts and an upcoming pre-order lane. Works on any tablet." },
  { icon: MessageCircle, title: "GST invoices on WhatsApp", body: "Sequential, FY-wise invoice numbers with CGST/SGST. Guests download the PDF or get it on WhatsApp instantly." },
  { icon: LayoutGrid, title: "Live floor view", body: "Every table's status at a glance: ordering, bill requested, paying at counter, or calling for water." },
  { icon: LineChart, title: "Owner analytics", body: "Revenue, AOV, rush hours, best-sellers, payment split and ratings — no spreadsheets." },
];

const LOOP = [
  ["Book", "Guest reserves a table and pre-orders"],
  ["Pre-cook", "Kitchen fires the order before arrival"],
  ["Seat", "Pre-order lands on the table's bill"],
  ["Order more", "Rounds from every phone at the table"],
  ["Pay", "UPI at the table or cash at the counter"],
  ["Invoice", "GST PDF + WhatsApp, then a rating"],
];

const PLANS = [
  { name: "Starter", price: "₹999", tagline: "Cafés & quick-service", features: ["QR menu & table ordering", "Pay at counter + PDF invoices", "Live orders board", "Up to 15 tables · 3 staff"], highlight: false },
  { name: "Growth", price: "₹2,499", tagline: "Everything a busy restaurant needs", features: ["Everything in Starter", "Online payments (UPI, cards)", "WhatsApp invoices", "Table booking + pre-order", "Kitchen display", "Takeaway & delivery storefront", "Analytics · unlimited tables"], highlight: true },
  { name: "Pro", price: "₹4,999", tagline: "Multi-outlet & fine dining", features: ["Everything in Growth", "Multi-outlet dashboard", "Custom domain & branding", "API & webhooks", "Priority support"], highlight: false },
];

const COMPARE: [string, string | boolean, string | boolean, string | boolean][] = [
  ["Commission on orders", "0%", "Per-order commission", "0%"],
  ["You own guest data", true, false, true],
  ["QR ordering in rounds, shared table bill", true, false, "Add-on"],
  ["Pay at table + guided pay at counter", true, false, "Partial"],
  ["Booking with pre-cooked food", true, "Booking only", false],
  ["Kitchen display", true, false, "Add-on"],
  ["GST invoice on WhatsApp", true, false, "Partial"],
  ["Setup time", "10 minutes", "Days", "Days–weeks"],
  ["Special hardware", "None", "None", "Often"],
];

const FAQ = [
  ["Do guests need to download an app?", "No. The QR opens a fast web page. No sign-up, no OTP — just order."],
  ["What if a guest wants to pay cash?", "They tap “Pay at counter”. Their phone shows the table and bill reference with directions; the cashier sees them in the counter queue and settles in one tap. The guest's screen updates instantly with the invoice."],
  ["Which payment methods are supported?", "UPI, cards, wallets and netbanking through Razorpay, with money going straight to your account. Plus cash, card and UPI at the counter."],
  ["Is the invoice GST compliant?", "Invoices carry your GSTIN and FSSAI, a sequential number that resets each financial year, and CGST/SGST lines. Service charge stays optional and off by default."],
  ["Can my waiters still take orders?", "Yes. Staff can add items to any table from the dashboard, and guests without phones are covered."],
  ["How long does setup take?", "About 10 minutes. You start with a sample menu, edit it, add tables and print the auto-generated QR table tents."],
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="mx-auto size-5 text-emerald-600" />;
  if (v === false) return <X className="mx-auto size-5 text-subtle" />;
  return <span className="text-sm text-fg-2">{v}</span>;
}

function PhoneMock() {
  const items = [
    ["Paneer Tikka", "₹280", "🥟", true],
    ["Butter Chicken", "₹360", "🍛", false],
    ["Chicken Dum Biryani", "₹340", "🍚", false],
  ] as const;
  return (
    <div className="relative mx-auto w-[290px]">
      <div className="rounded-[2.6rem] border-[10px] border-zinc-900 bg-surface shadow-2xl shadow-zinc-900/30 dark:border-zinc-800 dark:ring-1 dark:ring-white/10 dark:shadow-black/60">
        <div className="overflow-hidden rounded-[1.9rem]">
          <div className="flex items-center gap-2 border-b border-line-soft px-4 pb-3 pt-5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-brand text-xs font-black text-white">SG</div>
            <div className="flex-1">
              <p className="text-sm font-extrabold">Spice Garden</p>
              <p className="text-[10px] text-muted">Table <b>T4</b> · 3 guests</p>
            </div>
            <span className="rounded-full bg-inverse px-2.5 py-1 text-[10px] font-bold text-inverse-fg">Call staff</span>
          </div>
          <div className="flex gap-1.5 overflow-hidden px-4 py-2.5">
            {["🥟 Starters", "🍛 Mains", "🍚 Biryani"].map((c, i) => (
              <span key={c} className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${i === 0 ? "border-brand bg-brand text-white" : "border-line"}`}>{c}</span>
            ))}
          </div>
          <div className="divide-y divide-dashed divide-line px-4">
            {items.map(([name, price, emoji, added]) => (
              <div key={name} className="flex gap-3 py-3">
                <div className="flex-1">
                  <span className="inline-block size-3 rounded-[2px] border border-veg p-[2px]"><span className="block size-full rounded-full bg-veg" /></span>
                  <p className="text-[13px] font-bold leading-tight">{name}</p>
                  <p className="text-[12px] font-semibold">{price}</p>
                  <p className="mt-0.5 text-[10px] text-subtle">Chargrilled, smoky, house special</p>
                </div>
                <div className="relative">
                  <div className="flex size-16 items-center justify-center rounded-xl bg-gradient-to-br from-orange-50 dark:from-orange-500/15 to-rose-100 dark:to-rose-500/10 text-2xl">{emoji}</div>
                  <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-md border bg-surface px-3 py-0.5 text-[10px] font-extrabold shadow ${added ? "border-brand text-brand" : "border-brand/30 text-brand"}`}>{added ? "− 1 +" : "ADD"}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="m-3 flex items-center justify-between rounded-2xl bg-brand px-3 py-2.5 text-white">
            <span><span className="block text-[9px] font-bold uppercase opacity-80">2 items · Table T4</span><span className="text-sm font-extrabold">₹640</span></span>
            <span className="text-xs font-bold">Send to kitchen →</span>
          </div>
        </div>
      </div>
      <div className="absolute -left-24 top-24 hidden w-52 animate-float rounded-2xl bg-surface p-3 shadow-float ring-1 ring-line-soft sm:block">
        <p className="flex items-center gap-2 text-xs font-bold"><BellRing className="size-4 text-brand" /> New order #042</p>
        <p className="text-[11px] text-muted">Table T4 · 2 items · just now</p>
      </div>
      <div className="absolute -right-20 top-56 hidden w-48 animate-float rounded-2xl bg-surface p-3 shadow-float ring-1 ring-line-soft [animation-delay:1s] sm:block">
        <p className="flex items-center gap-2 text-xs font-bold"><Check className="size-4 text-emerald-600" /> Paid ₹1,240 · UPI</p>
        <p className="text-[11px] text-muted">Invoice SG/26-27/00187</p>
      </div>
      <div className="absolute -left-16 bottom-10 hidden w-48 animate-float rounded-2xl bg-surface p-3 shadow-float ring-1 ring-line-soft [animation-delay:2s] sm:block">
        <p className="flex items-center gap-2 text-xs font-bold"><MessageCircle className="size-4 text-emerald-600" /> Invoice on WhatsApp</p>
        <p className="text-[11px] text-muted">Sent to +91 98•••• 3210</p>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="bg-surface text-fg">
      <header className="sticky top-0 z-40 border-b border-line-soft bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-brand text-sm font-black text-white">D</span>
            <span className="text-lg font-extrabold tracking-tight">DineOS</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-muted md:flex">
            <a href="#features" className="hover:text-fg">Features</a>
            <a href="#loop" className="hover:text-fg">How it works</a>
            <a href="#pricing" className="hover:text-fg">Pricing</a>
            <a href="#faq" className="hover:text-fg">FAQ</a>
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
          <Link href="/login" className="text-sm font-semibold text-fg-2 hover:text-fg">Log in</Link>
          <Link href="/signup" className="rounded-xl bg-inverse px-4 py-2 text-sm font-bold text-inverse-fg hover:opacity-90">Start free trial</Link>
        </div>
      </header>

      <section className="hero-glow overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-bold text-brand-800 shadow-sm ring-1 ring-brand-100">
              <UtensilsCrossed className="size-3.5" /> Dine-in · Booking · Takeaway · Delivery
            </span>
            <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              Your whole restaurant, run from <span className="text-brand">one QR code.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Guests order and pay from the table — or walk to the counter with a ready bill. Bookings arrive with food already cooking.
              Takeaway runs on your own link with 0% commission. Your kitchen, floor and cashier stay in sync, live.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-bold text-white shadow-lg shadow-brand/30 hover:bg-brand-700">
                Start 14-day free trial <ArrowRight className="size-4" />
              </Link>
              <Link href="/t/demo-t1" className="inline-flex h-12 items-center gap-2 rounded-xl bg-surface px-6 font-bold text-fg ring-1 ring-line hover:bg-surface-2">
                <QrCode className="size-4" /> Try it as a guest
              </Link>
            </div>
            <p className="mt-3 text-sm text-muted">
              Or open the <Link href="/r/spice-garden" className="font-semibold text-fg-2 underline">demo storefront</Link> · <Link href="/login" className="font-semibold text-fg-2 underline">demo dashboard</Link>
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-fg-2">
              {["0% commission", "No hardware", "UPI, cards & cash", "GST-ready invoices"].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-emerald-600" /> {t}</li>
              ))}
            </ul>
          </div>
          <PhoneMock />
        </div>
      </section>

      <section className="border-y border-line-soft bg-surface-2">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 text-center md:grid-cols-4">
          {[
            ["< 1 min", "from scan to first order"],
            ["0%", "commission on direct orders"],
            ["10 min", "to set up with a sample menu"],
            ["1 tap", "for the cashier to settle a bill"],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-3xl font-black tracking-tight">{k}</p>
              <p className="text-sm text-muted">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <p className="text-sm font-bold uppercase tracking-widest text-brand">Everything in one place</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">Replace your QR menu, POS add-ons, booking tool and aggregator dependence.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl border border-line p-6 transition hover:-translate-y-0.5 hover:shadow-card">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand"><f.icon className="size-5" /></span>
              <p className="mt-4 font-extrabold">{f.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="loop" className="bg-zinc-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="text-sm font-bold uppercase tracking-widest text-brand">The complete dine-in loop</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">From booking to WhatsApp invoice, with no waiting in between.</h2>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {LOOP.map(([title, body], i) => (
              <li key={title} className="relative rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
                <span className="text-sm font-black text-brand">0{i + 1}</span>
                <p className="mt-2 text-lg font-extrabold">{title}</p>
                <p className="mt-1 text-sm text-white/60">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 grid gap-4 lg:grid-cols-4">
            {[
              [Store, "Owners", "Analytics, menu & pricing, taxes, staff roles, subscription — from your phone."],
              [ChefHat, "Kitchen", "A dark, glanceable KDS with timers and pre-order lanes. Bump when ready."],
              [Receipt, "Cashier", "A counter queue with bill refs, change calculator and one-tap invoices."],
              [BellRing, "Waiters", "A live floor map with requests, seating and order-for-guest."],
            ].map(([Icon, t, b]) => {
              const I = Icon as typeof Store;
              return (
                <div key={t as string} className="rounded-3xl bg-gradient-to-b from-white/10 to-white/5 p-6 ring-1 ring-white/10">
                  <I className="size-6 text-brand" />
                  <p className="mt-3 font-extrabold">For {t as string}</p>
                  <p className="mt-1 text-sm text-white/60">{b as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-black tracking-tight">Why owners switch</h2>
        <div className="mt-8 overflow-x-auto rounded-3xl border border-line">
          <table className="w-full min-w-[640px] text-center">
            <thead className="bg-surface-2 text-sm">
              <tr>
                <th className="px-5 py-4 text-left font-semibold text-muted"> </th>
                <th className="px-5 py-4 font-extrabold text-brand">DineOS</th>
                <th className="px-5 py-4 font-semibold text-muted">Aggregator apps</th>
                <th className="px-5 py-4 font-semibold text-muted">Traditional POS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {COMPARE.map(([label, a, b, c]) => (
                <tr key={label}>
                  <td className="px-5 py-3.5 text-left text-sm font-semibold">{label}</td>
                  <td className="bg-brand-50/40 px-5 py-3.5 font-bold"><Cell v={a} /></td>
                  <td className="px-5 py-3.5"><Cell v={b} /></td>
                  <td className="px-5 py-3.5"><Cell v={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="pricing" className="bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-brand">Simple pricing</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Flat monthly price. Zero commission. Ever.</h2>
            <p className="mt-3 text-muted">14-day free trial on every plan · no card required · 20% off yearly</p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.name} className={`relative flex flex-col rounded-3xl bg-surface p-7 ${p.highlight ? "shadow-float ring-2 ring-brand" : "ring-1 ring-line"}`}>
                {p.highlight && <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">Most popular</span>}
                <p className="text-xl font-extrabold">{p.name}</p>
                <p className="text-sm text-muted">{p.tagline}</p>
                <p className="mt-5"><span className="text-4xl font-black">{p.price}</span><span className="text-muted">/month</span></p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="size-4 shrink-0 text-emerald-600" />{f}</li>)}
                </ul>
                <Link href="/signup" className={`mt-8 inline-flex h-11 items-center justify-center rounded-xl font-bold ${p.highlight ? "bg-brand text-white hover:bg-brand-700" : "bg-inverse text-inverse-fg hover:opacity-90"}`}>
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted">Payment-gateway fees are charged by the gateway at cost. We add nothing on top.</p>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-4 py-20">
        <h2 className="text-center text-3xl font-black tracking-tight">Questions owners ask</h2>
        <div className="mt-10 divide-y divide-line rounded-3xl border border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
                {q}
                <span className="text-xl text-subtle transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand to-brand-deep px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Take your first QR order tonight.</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">Sign up, tweak the sample menu, print your table QR codes. That&apos;s it.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex h-12 items-center gap-2 rounded-xl bg-surface px-6 font-bold text-fg">Start free trial <ArrowRight className="size-4" /></Link>
            <Link href="/t/demo-t1" className="inline-flex h-12 items-center gap-2 rounded-xl px-6 font-bold ring-1 ring-white/40 hover:bg-white/10">Try the guest demo</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted">
          <p>© {new Date().getFullYear()} DineOS · Built for restaurants in India</p>
          <div className="flex gap-5">
            <a href="#pricing">Pricing</a>
            <Link href="/login">Log in</Link>
            <Link href="/signup">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
