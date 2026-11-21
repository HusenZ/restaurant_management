# DineOS — Product Plan

> One QR code runs the whole restaurant: dine-in ordering and payment at the table, table booking with pre-cooked food, takeaway and delivery with 0% commission, a live kitchen display, and GST invoices on WhatsApp.

---

## 1. Problem

| Who | Pain today |
|---|---|
| **Guests** | Wait for a menu, wait to order, wait for the bill, wait for the card machine. Food ordered with a booking still takes 25 minutes after arrival. Paper bills get lost. |
| **Owners** | Aggregators take a large commission on every order. POS systems are expensive, need hardware, and take days to set up. Data is split across POS, aggregator dashboards, and notebooks. |
| **Staff** | Waiters run back and forth for orders, water, and bills. The kitchen reads handwritten KOTs. The cashier chases tables to settle. |

## 2. Vision & positioning

**"The restaurant OS that pays for itself in the first week."**

- **Guest-first**: no app download, no sign-up. Scan, order, pay in under 60 seconds.
- **Owner-first economics**: flat subscription, **0% commission**, direct relationship with guests (phone numbers stay with the restaurant).
- **10-minute setup**: sign up, a sample menu is created, print QR codes, take the first order.
- **Works on what they already own**: any phone, tablet, or laptop. No proprietary hardware.

## 3. Personas

1. **Guest (dine-in)**: scans the table QR, orders in rounds with friends, calls the waiter, pays online or at the counter, and gets the invoice on WhatsApp.
2. **Guest (takeaway/delivery)**: orders from the restaurant's own link (Instagram bio, Google Maps), picks a time, pays, and tracks a live token.
3. **Guest (booking)**: books a table, optionally pre-orders so food is ready on arrival, and taps "I'm on my way" to start cooking.
4. **Owner/manager**: menu, pricing, taxes, analytics, staff, and subscription.
5. **Waiter/captain**: live floor view, attends calls, seats walk-ins and reservations, places orders for guests.
6. **Kitchen (chef)**: kitchen display (KDS), tickets with age timers, bump when ready, upcoming pre-orders.
7. **Cashier**: counter-payment queue, collects cash/card/UPI with change calculation, issues invoices.

## 4. Competitive landscape

| Category | Examples | Strengths | Gaps we exploit |
|---|---|---|---|
| Traditional cloud POS (India) | Petpooja, Restroworks/Posist, Rista | Deep billing, inventory, hardware integrations | Guest experience is an afterthought; QR ordering is an add-on; setup needs onboarding calls |
| QR / digital-ordering players | DotPe, MENU TIGER, Thrive | Fast QR menus | Weak kitchen/floor operations, limited booking + pre-order, payments often tied to their own gateway |
| Aggregators | Zomato, Swiggy (incl. dining-out) | Demand generation | Commission on every order, the guest relationship belongs to the aggregator |
| Global restaurant platforms | Toast, Square for Restaurants, Owner.com | Polished UX, strong KDS and online ordering | Not built for India (GST, UPI, WhatsApp, pay-at-counter culture) |

**Our wedge:** the **complete dine-in loop** (book → pre-cook → seat → QR order in rounds → pay at table *or* counter → WhatsApp invoice) in one product, at a flat price, with an Indian-first payments and compliance stack.

### Differentiators (why owners switch)
1. **Pre-order with table booking** and "I'm on my way" kitchen firing, so table turns are 20–30 minutes faster.
2. **Pay at table *or* guided pay at counter**: a live "go to the counter" screen with bill number and directions, which the cashier settles in one tap, and the guest's phone updates instantly.
3. **WhatsApp invoices** (GST-compliant PDF), plus a share link fallback that works without any WhatsApp Business setup.
4. **Group ordering**: everyone at the table orders from their own phone into one shared table bill.
5. **Live floor + KDS + cashier** in one realtime app on any device.
6. **0% commission** on takeaway and delivery through the restaurant's own storefront link.
7. **Onboarding in minutes**: sample menu, auto-generated table QR print sheet, and an activation checklist.

## 5. Feature map

### 5.1 Dine-in
- Table QR → table-scoped menu (no login); sessions shared by everyone at the table
- Ordering in **rounds** (KOTs); each round tracked live (placed → accepted → preparing → ready → served)
- Service requests: call waiter, water, cutlery, clean table, help with payment
- Live table bill with "split evenly" helper
- Payment: **online** (UPI, cards, wallets through Razorpay) or **pay at counter** (cash/card/UPI) with a guided counter screen
- Invoice: PDF download, WhatsApp send, share link; feedback rating after payment

### 5.2 Table booking + pre-cook
- Slot availability based on table capacity, slot length, and dining duration
- Party size, occasion, and special requests
- Optional **pre-order** from the full menu; the kitchen sees it in the "Upcoming" lane
- Auto-fire to the kitchen *N* minutes before arrival, or when the guest taps **"I'm on my way"**
- Staff confirm, seat (assign table), mark no-show; the pre-order moves into the table's bill on seating

### 5.3 Takeaway & delivery (online ordering)
- Restaurant storefront `/r/{slug}`: share in Instagram bio, Google Business Profile, WhatsApp
- ASAP or scheduled pickup, delivery address, delivery fee, and minimum order
- Pay online, or pay at pickup/on delivery
- Live tracking with a token number; invoice on completion

### 5.4 Operations (dashboard)
- **Live orders board** (Kanban) with on-screen (and optional sound) alerts and age colors
- **Kitchen display** (dark, full-screen, bump workflow, item strike-through, upcoming pre-orders)
- **Floor view** of tables with status colors: free, occupied, bill requested, awaiting counter, needs attention
- **Cashier**: counter queue, open bills, discounts, cash change calculator, invoice re-send
- **Reservations**: day view, confirm/seat/no-show, pre-order preview
- **Menu**: categories, items, variants/add-ons (modifier groups), veg/non-veg/egg, tags, prep time, image upload, one-tap "out of stock"
- **QR codes**: per-table PNG and a printable table-tent PDF
- **Staff & roles**: owner, manager, cashier, waiter, kitchen
- **Analytics**: revenue, orders, AOV, hourly heatmap, top items, order-type and payment-mode split
- **Settings**: profile, GSTIN/FSSAI, tax lines (CGST/SGST), inclusive/exclusive pricing, optional service charge, feature toggles, counter directions, theme color
- **Subscription**: plan, trial status, upgrade

### 5.5 Gaps we added beyond the brief
| Gap | Why it matters | Status |
|---|---|---|
| Group ordering on one table session | Real tables have 4 phones, not 1 | Built |
| Service requests (waiter/water/bill) | The biggest guest frustration after ordering | Built |
| Kitchen display + upcoming pre-orders | Pre-cooking is useless if the kitchen can't see it | Built |
| Counter-payment queue for cashiers | The "pay at counter" flow needs a staff side | Built |
| "I'm on my way" pre-order firing | Avoids cold food when guests are late | Built |
| GST-compliant invoice numbering (per financial year) | Legal requirement in India | Built |
| Service charge OFF by default and clearly optional | CCPA guidelines: service charge can't be mandatory | Built |
| Idempotent order placement | Double taps on bad 4G must not duplicate orders | Built |
| Item availability toggle ("86") | Prevents orders for sold-out dishes | Built |
| Onboarding checklist + sample menu | Activation drives subscription conversion | Built |
| Guest feedback after payment | Reputation loop; capture before Google review | Built |
| Notification audit log | Proof of WhatsApp delivery for disputes | Built |
| Split bill by items, tips, coupons/loyalty | Upsell features | Roadmap |
| Inventory & recipe costing, multi-outlet, aggregator sync, thermal printing, offline mode | Pro tier | Roadmap |

## 6. Key user journeys

### Dine-in (QR)
```
Scan QR → Welcome (name, guests) → Menu → Add items/customise → Send to kitchen
  → Live status of round → (order more rounds) → Call waiter (optional)
  → Bill → [Pay online → Razorpay → Success]  or  [Pay at counter → Counter screen → Cashier settles → Success]
  → Download PDF / Send to WhatsApp → Rate experience
```

### Booking with pre-cook
```
/r/{slug}/book → party size → date → slot → details → (optional) pre-order dishes → Confirmed page
  → Restaurant confirms → Guest taps "I'm on my way" (or auto-fire T-15 min) → Kitchen cooks
  → Guest arrives → Staff seat at table → Pre-order already on the table bill → Scan QR to add more → Pay
```

### Takeaway
```
/r/{slug} → Takeaway → Menu → Checkout (ASAP/time, name, phone) → Pay online or at pickup
  → Track page (token #, live status) → Ready → Pick up → Invoice
```

## 7. Monetisation (SaaS subscription)

| Plan | Price (INR / month, billed yearly −20%) | For | Includes |
|---|---|---|---|
| **Starter** | ₹999 | Cafés, QSR | QR menu & ordering, up to 15 tables, pay at counter, PDF invoices, live orders, 3 staff |
| **Growth** *(most popular)* | ₹2,499 | Casual dining | Everything in Starter + unlimited tables, online payments, WhatsApp invoices, booking + pre-order, KDS, takeaway & delivery, analytics, 15 staff |
| **Pro** | ₹4,999 | Fine dining, multi-outlet | Everything in Growth + multi-outlet, custom domain, API & webhooks, advanced analytics, priority support |

- **14-day free trial**, no card required. **0% commission** on all plans.
- Payment-gateway fees go directly to the gateway (pass-through); there is no markup.
- Expansion revenue: extra outlets, WhatsApp marketing credits, hardware bundles (tablets/printers).

## 8. Success metrics
- **Activation**: first live order within 24 hours of signup (target > 60%)
- **Guest**: scan-to-first-order < 90 s; QR-payment share > 50% of dine-in bills
- **Ops**: average ticket time; table turn time −20% for pre-order bookings
- **Business**: trial → paid > 25%; logo churn < 2% per month; NPS > 50

## 9. Go-to-market
1. Land with **free QR menu + pay at counter** (Starter trial), then expand to online payments, booking, and KDS.
2. Channels: field sales in food clusters, POS-switch offers, partnerships with restaurant consultants, Instagram case-study reels.
3. Every guest invoice and storefront carries a subtle "Powered by DineOS" (removable on Pro), which creates a viral loop among owners who dine out.
