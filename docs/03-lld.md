# DineOS — Low-Level Design (LLD)

## 1. Backend module layout

```
backend/app
├── main.py              # app factory, CORS, routers, lifespan (DB init, seed, scheduler)
├── config.py            # pydantic-settings (env driven)
├── db.py                # async engine/session, Base, UTCDateTime type
├── security.py          # bcrypt hashing, JWT (staff + guest tokens)
├── deps.py              # current user, role guards, guest-token guards
├── models/              # SQLAlchemy models (one module per aggregate)
├── schemas/             # Pydantic request/response models
├── routers/             # auth, restaurant, menu, tables, orders, sessions, billing,
│                        # reservations, analytics, staff, uploads, public, ws, plans
└── services/
    ├── pricing.py       # line pricing + bill totals (integer paise)
    ├── ordering.py      # order placement, status machine, numbering
    ├── billing.py       # bill build/recompute, payments, invoice numbering
    ├── reservations.py  # slot availability, seating, pre-order firing
    ├── invoice_pdf.py   # ReportLab GST invoice + QR table-tent sheet
    ├── payments.py      # PaymentProvider: Mock, Razorpay
    ├── whatsapp.py      # WhatsAppProvider: Console, MetaCloud
    ├── realtime.py      # Broker: InMemory, Redis + connection hub
    ├── counters.py      # atomic per-tenant sequences
    └── scheduler.py     # pre-order firing, payment expiry loop
```

## 2. Data model

```mermaid
erDiagram
  RESTAURANT ||--o{ USER : employs
  RESTAURANT ||--o{ DINING_TABLE : has
  RESTAURANT ||--o{ MENU_CATEGORY : has
  MENU_CATEGORY ||--o{ MENU_ITEM : contains
  MENU_ITEM ||--o{ MODIFIER_GROUP : has
  MODIFIER_GROUP ||--o{ MODIFIER_OPTION : has
  DINING_TABLE ||--o{ DINING_SESSION : hosts
  DINING_SESSION ||--o{ ORDER : "rounds (KOTs)"
  DINING_SESSION ||--o| BILL : settles
  ORDER ||--o{ ORDER_ITEM : contains
  ORDER ||--o| BILL : "takeaway/delivery bill"
  BILL ||--o{ PAYMENT : "paid by"
  BILL ||--o| FEEDBACK : rated
  RESERVATION ||--o| ORDER : "pre-order"
  RESERVATION ||--o| DINING_SESSION : "seated as"
  DINING_SESSION ||--o{ SERVICE_REQUEST : raises
  RESTAURANT ||--o{ NOTIFICATION : logs
  RESTAURANT ||--o{ COUNTER : sequences
```

All money columns are **integers in minor units** (paise). All timestamps are stored as UTC.

| Table | Key columns |
|---|---|
| `restaurants` | id, name, **slug (unique)**, tagline, description, cuisines[], logo_url, cover_url, phone, email, whatsapp_number, address_line, city, state, pincode, country, currency, timezone, gstin, fssai_number, settings (JSON), plan, plan_status, trial_ends_at, menu_version |
| `users` | id, restaurant_id, name, **email (unique)**, phone, password_hash, role (`owner/manager/cashier/waiter/kitchen`), is_active, last_login_at |
| `dining_tables` | id, restaurant_id, label, area, capacity, **qr_token (unique)**, is_active, sort_order |
| `menu_categories` | id, restaurant_id, name, description, icon, sort_order, is_active |
| `menu_items` | id, restaurant_id, category_id, name, description, price, image_url, diet (`veg/non_veg/egg/vegan`), tags[], spice_level, prep_minutes, is_available, is_active, sort_order |
| `modifier_groups` | id, item_id, name, min_select, max_select, sort_order |
| `modifier_options` | id, group_id, name, price_delta, is_available, is_default, sort_order |
| `dining_sessions` | id, restaurant_id, table_id, reservation_id, status (`open/bill_requested/closed`), guest_name, guest_count, customer_phone, opened_by, opened_at, closed_at |
| `orders` | id, restaurant_id, session_id?, reservation_id?, order_type (`dine_in/takeaway/delivery`), status, **number** (daily token), source (`qr/web/staff/reservation`), customer_name, customer_phone, notes, delivery_address (JSON), scheduled_for, **client_order_id** (idempotency, unique per tenant), subtotal, item_count, accepted/ready/completed/cancelled timestamps, cancel_reason |
| `order_items` | id, order_id, menu_item_id, **snapshot** name/diet/unit_price/modifiers, quantity, notes, line_total, is_done |
| `bills` | id, restaurant_id, session_id? / order_id?, invoice_number, status (`open/paid/void`), subtotal, discount, discount_reason, service_charge, taxes (JSON lines), tax_total, delivery_fee, round_off, total, amount_paid, customer_name, customer_phone, pay_preference (`online/counter`), counter_requested_at, paid_at |
| `payments` | id, restaurant_id, bill_id, method (`upi/card/cash/online`), provider (`razorpay/mock/manual`), status (`created/succeeded/failed`), amount, tendered, change_due, provider_order_id, provider_payment_id, collected_by, meta |
| `reservations` | id, restaurant_id, **code**, customer_name, customer_phone, customer_email, party_size, reserved_for, duration_minutes, status, occasion, notes, table_id, session_id, preorder_order_id, guest_on_way_at |
| `service_requests` | id, restaurant_id, table_id, session_id, kind (`waiter/water/cutlery/cleaning/bill/payment_help`), note, status (`open/resolved`), resolved_by |
| `feedback` | id, restaurant_id, bill_id, rating (1–5), comment |
| `notifications` | id, restaurant_id, channel, recipient, kind, status (`sent/simulated/failed`), provider, provider_message_id, error, payload |
| `counters` | (restaurant_id, key) PK, value — keys like `order:2026-11-19`, `invoice:26-27` |

### Settings document (`restaurants.settings`)
```json
{
  "dine_in_enabled": true, "takeaway_enabled": true, "delivery_enabled": true,
  "reservations_enabled": true, "preorder_enabled": true,
  "online_payment_enabled": true, "pay_at_counter_enabled": true,
  "auto_accept_orders": false, "avg_prep_minutes": 20,
  "taxes": [{"name": "CGST", "rate": 2.5}, {"name": "SGST", "rate": 2.5}],
  "prices_include_tax": false, "service_charge_percent": 0, "round_off": true,
  "delivery_fee": 4000, "min_delivery_order": 20000,
  "opening_time": "11:00", "closing_time": "23:00", "closed_weekdays": [],
  "reservation_slot_minutes": 30, "reservation_duration_minutes": 90, "max_party_size": 12,
  "preorder_fire_minutes_before": 15, "auto_confirm_reservations": true,
  "counter_directions": "Billing counter is next to the entrance.",
  "invoice_prefix": "SG", "invoice_footer": "Thank you! Visit again.",
  "theme_color": "#E8590C"
}
```

## 3. State machines

### Order
```mermaid
stateDiagram-v2
  [*] --> pending_payment: takeaway/delivery + pay online
  [*] --> scheduled: reservation pre-order
  [*] --> placed: QR / staff / pay-at-counter
  pending_payment --> placed: payment succeeded
  pending_payment --> cancelled: expired (15 min)
  scheduled --> placed: T-minus fire / "I'm on my way" / seated
  placed --> preparing: accept (or auto-accept)
  placed --> cancelled: reject
  preparing --> ready: bump (KDS)
  preparing --> cancelled
  ready --> served: dine-in
  ready --> out_for_delivery: delivery
  ready --> completed: takeaway picked up
  out_for_delivery --> completed
  served --> completed: bill paid
```

### Dining session & bill
```mermaid
stateDiagram-v2
  [*] --> open: first scan / staff seats walk-in / reservation seated
  open --> bill_requested: guest taps "Bill" or staff generates bill
  bill_requested --> open: guest orders another round (bill recomputed)
  bill_requested --> closed: bill paid (online or counter)
  open --> closed: staff closes (no orders / void)
```

### Reservation
```mermaid
stateDiagram-v2
  [*] --> pending
  [*] --> confirmed: auto-confirm on
  pending --> confirmed
  confirmed --> seated: staff assigns table (opens session, fires pre-order)
  seated --> completed: bill paid
  pending --> cancelled
  confirmed --> cancelled
  confirmed --> no_show
```

## 4. API catalog (`/api/v1`)

### Auth & tenant
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | — | Create restaurant + owner (+ sample menu & tables) |
| POST | `/auth/login` | — | Email/password → access + refresh |
| POST | `/auth/refresh` | — | Rotate access token |
| GET | `/auth/me` | any staff | Current user + restaurant |
| GET/PATCH | `/restaurant` | manager+ | Profile |
| PATCH | `/restaurant/settings` | manager+ | Settings document |
| GET | `/restaurant/onboarding` | any | Activation checklist |
| GET/POST/PATCH | `/staff`, `/staff/{id}` | owner/manager | Staff & roles |
| GET | `/plans` | — | Subscription plans |
| POST | `/uploads` | manager+ | Image upload → URL |

### Menu & tables
| Method | Path | Purpose |
|---|---|---|
| GET | `/menu` | Full menu (staff view incl. inactive) |
| POST/PATCH/DELETE | `/menu/categories[/{id}]` | Categories |
| POST/PATCH/DELETE | `/menu/items[/{id}]` | Items incl. modifier groups (replace semantics) |
| PATCH | `/menu/items/{id}/availability` | Mark in/out of stock |
| GET/POST/PATCH/DELETE | `/tables[/{id}]` | Tables |
| POST | `/tables/{id}/rotate-qr` | New QR token |
| GET | `/tables/{id}/qr.png?base_url=` | QR image |
| GET | `/tables-qr-sheet.pdf?base_url=` | Printable table tents (A4, 4 per page) |
| GET | `/tables/live` | Floor view: tables + session summary + open requests |

### Operations
| Method | Path | Purpose |
|---|---|---|
| GET | `/orders?status=&type=&active=` | Order list (board, KDS) |
| POST | `/orders` | Staff/waiter places order for a table or counter takeaway |
| PATCH | `/orders/{id}/status` | Status transition (validated) |
| PATCH | `/orders/{id}/items/{item_id}` | KDS item strike (`is_done`) |
| POST | `/orders/{id}/fire` | Fire a scheduled pre-order now |
| POST | `/sessions` | Seat walk-in at table |
| GET | `/sessions/{id}` | Session detail with orders & bill |
| POST | `/sessions/{id}/bill` | Generate/recompute bill |
| POST | `/sessions/{id}/close` | Close (void if unpaid & empty) |
| GET | `/bills?status=&counter=` | Bills (counter queue, open, paid) |
| GET | `/bills/{id}` | Bill detail |
| POST | `/bills/{id}/discount` | Apply discount (flat or %) |
| POST | `/bills/{id}/collect` | Record cash/card/UPI at counter (tendered → change) |
| GET | `/bills/{id}/invoice.pdf` | Invoice PDF |
| POST | `/bills/{id}/whatsapp` | Send invoice to WhatsApp |
| GET | `/service-requests?status=open` | Waiter calls |
| POST | `/service-requests/{id}/resolve` | Resolve |
| GET | `/reservations?date=` | Day list |
| PATCH | `/reservations/{id}` | Status/notes |
| POST | `/reservations/{id}/seat` | Assign table → session, pre-order into table bill |
| GET | `/analytics/summary?days=` | KPIs, time series, top items, splits |
| GET | `/feedback` | Ratings |

### Public (guest)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/public/restaurants/{slug}` | — | Storefront profile + public settings |
| GET | `/public/restaurants/{slug}/menu` | — | Menu (cacheable) |
| GET | `/public/tables/{qr}` | — | Resolve QR → restaurant + table + open session info |
| GET | `/public/qr/{qr}.png?base_url=` | — | QR image for a table (token is already public) |
| POST | `/public/tables/{qr}/session` | — | Join/create session → **session guest token** |
| GET | `/public/sessions/me` | session token | Session, orders, bill |
| POST | `/public/sessions/me/orders` | session token | Place round (idempotent `client_order_id`) |
| POST | `/public/sessions/me/requests` | session token | Call waiter etc. |
| POST | `/public/sessions/me/bill` | session token | Request bill |
| POST | `/public/restaurants/{slug}/orders` | — | Takeaway/delivery → **order guest token** |
| GET | `/public/orders/me` | order token | Tracking |
| POST | `/public/bills/{id}/pay` | session/order token | `online` → checkout payload, `counter` → counter screen |
| POST | `/public/payments/{id}/verify` | guest token | Razorpay signature verify |
| POST | `/public/payments/{id}/mock-complete` | guest token | Dev mock gateway |
| POST | `/public/payments/razorpay/webhook` | HMAC | Source of truth for online payments |
| GET | `/public/bills/{id}/invoice.pdf?token=` | signed | Invoice download |
| POST | `/public/bills/{id}/whatsapp` | guest token | Send invoice to WhatsApp |
| POST | `/public/bills/{id}/feedback` | guest token | Rating |
| GET | `/public/restaurants/{slug}/slots?date=&party_size=` | — | Reservation availability |
| POST | `/public/restaurants/{slug}/reservations` | — | Book (+ pre-order) → **reservation token** |
| GET | `/public/reservations/me` | reservation token | Status |
| POST | `/public/reservations/me/on-my-way` | reservation token | Fire pre-order now |
| POST | `/public/reservations/me/cancel` | reservation token | Cancel |

### WebSocket
- `/ws/staff?token=<access>` → channel `staff:{restaurant_id}`
- `/ws/guest?token=<guest>` → channel `session:{id}` / `order:{id}` / `reservation:{id}`

Event envelope: `{"type": "order.updated", "data": {"order_id": "...", "status": "ready"}, "ts": "..."}`

Event types: `order.created`, `order.updated`, `session.updated`, `bill.updated`, `payment.succeeded`, `service_request.created`, `service_request.resolved`, `reservation.created`, `reservation.updated`, `menu.updated`.

## 5. Key sequences

### QR dine-in → pay at counter
```mermaid
sequenceDiagram
  actor Guest
  participant Web as Guest web
  participant API
  participant Hub as Realtime
  actor Staff as Cashier / Kitchen
  Guest->>Web: Scan QR /t/{qr}
  Web->>API: GET /public/tables/{qr}
  Web->>API: POST /public/tables/{qr}/session
  API-->>Web: session token
  Guest->>Web: Add items, "Send to kitchen"
  Web->>API: POST /public/sessions/me/orders (client_order_id)
  API->>Hub: order.created → staff, session
  Hub-->>Staff: KDS ticket + sound
  Staff->>API: PATCH /orders/{id}/status (preparing → ready → served)
  API->>Hub: order.updated → session
  Hub-->>Web: refetch, round shows "Ready"
  Guest->>Web: Bill → Pay at counter
  Web->>API: POST /public/bills/{id}/pay {mode: counter}
  API->>Hub: bill.updated → staff (counter queue)
  Web-->>Guest: Counter screen (bill #, amount, directions)
  Staff->>API: POST /bills/{id}/collect {method: cash, tendered}
  API->>API: payment succeeded, invoice no., close session
  API->>Hub: payment.succeeded → session
  Hub-->>Web: Success → PDF download / WhatsApp
```

### Online payment (Razorpay)
```mermaid
sequenceDiagram
  participant Web
  participant API
  participant RZP as Razorpay
  Web->>API: POST /public/bills/{id}/pay {mode: online}
  API->>RZP: POST /v1/orders {amount, receipt}
  RZP-->>API: order_id
  API-->>Web: {payment_id, key_id, order_id, amount}
  Web->>RZP: Checkout (UPI / card)
  RZP-->>Web: payment_id + signature
  Web->>API: POST /public/payments/{id}/verify
  API->>API: HMAC verify → mark paid (idempotent)
  RZP-->>API: webhook payment.captured (source of truth)
```

### Booking with pre-cook
```mermaid
sequenceDiagram
  actor Guest
  participant API
  participant Sched as Scheduler
  actor Kitchen
  Guest->>API: POST /public/restaurants/{slug}/reservations (+ preorder items)
  API->>API: reservation (confirmed) + order(status=scheduled, scheduled_for = time − fire_minutes)
  API-->>Kitchen: reservation.created (Upcoming lane)
  alt Guest taps "I'm on my way"
    Guest->>API: POST /public/reservations/me/on-my-way
    API->>API: order scheduled → placed
  else time reached
    Sched->>API: fire due scheduled orders
  end
  API-->>Kitchen: order.created (ticket)
  Note over API: On seating, the pre-order joins the table session → table bill
```

## 6. Algorithms

### Line pricing
`unit_price = item.price + Σ selected option.price_delta`, validated against each group's `min_select ≤ n ≤ max_select`, option availability, and item availability. `line_total = unit_price × qty`.

### Bill totals (integer paise)
```
subtotal        = Σ line_total of non-cancelled orders in the session (or the single order)
discount        = min(discount, subtotal)
base            = subtotal − discount
service_charge  = round(base × sc% / 100)                        # 0 by default (optional by law)
if prices_include_tax:
    gross = base + service_charge
    net   = round(gross × 100 / (100 + Σrate))
    tax_i = round(net × rate_i / 100) (last line absorbs rounding) → tax_total = gross − net
    pre   = gross + delivery_fee
else:
    tax_i = round((base + service_charge) × rate_i / 100)
    pre   = base + service_charge + Σtax_i + delivery_fee
total     = round_off ? nearest ₹1 of pre : pre
round_off = total − pre
```

### Numbering
- Order token: per-restaurant daily counter in the restaurant's timezone → `#042`.
- Invoice: `{prefix}/{FY}/{seq:05}` (FY Apr–Mar, e.g. `SG/26-27/00042`), assigned only when a bill is paid, which keeps the series gap-free as GST requires.

### Reservation availability
For each slot between opening and `closing − duration`, at step `slot_minutes`:
1. Collect active reservations overlapping `[slot, slot + duration)`.
2. Greedily assign them (largest party first) to the smallest table that fits.
3. The slot is available if a table with `capacity ≥ party_size` remains, and it is not in the past.

### Idempotency
`orders(restaurant_id, client_order_id)` is unique. A repeated POST returns the existing order (HTTP 200) instead of creating a duplicate. Payment success is applied once per bill (`bill.status` check inside the transaction).
