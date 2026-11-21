# DineOS — Restaurant OS (SaaS)

One QR code runs the whole restaurant:

- **Dine-in:** guests scan the table QR, order in rounds from every phone at the table, call staff, then pay online (UPI/card) or get a guided **pay-at-counter** screen. They receive a GST **PDF invoice** to download or on **WhatsApp**.
- **Table booking + pre-cook:** guests book a slot and pre-order. The kitchen fires the order just before arrival, or the moment the guest taps **"I'm on my way"**.
- **Takeaway & delivery:** a storefront link with 0% commission, ASAP or scheduled orders, online or pay-at-pickup payment, and live token tracking.
- **Light, dark and system themes** on every screen: a toggle in every header, Settings → Appearance in the dashboard, and no flash on load. The kitchen display stays dark by design.
- **Operations:** live order board, dark **kitchen display**, floor view, cashier counter queue with change calculator, reservations, menu with variants/add-ons, QR table tents, staff roles, settings, analytics, and subscription plans.

| Doc | What's inside |
|---|---|
| [docs/01-product-plan.md](docs/01-product-plan.md) | Problem, personas, competitor analysis, feature map, gaps filled, journeys, pricing, metrics, go-to-market |
| [docs/02-architecture-hld.md](docs/02-architecture-hld.md) | Tech-stack rationale, architecture diagram, realtime, multi-tenancy, scaling, security, deployment |
| [docs/03-lld.md](docs/03-lld.md) | Module layout, ERD and tables, state machines, full API catalog, sequence diagrams, pricing/tax/numbering algorithms |
| [docs/04-ui-ux.md](docs/04-ui-ux.md) | Design principles, competitor patterns adopted, design tokens, screen inventory |

## Tech stack
- **Backend:** Python 3.12+, FastAPI, SQLAlchemy 2 (async), Pydantic v2, JWT, WebSockets, ReportLab (PDF), qrcode. SQLite for dev, PostgreSQL in production; optional Redis for multi-instance realtime.
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, SWR, Zustand, lucide-react, sonner.
- **Integrations:** Razorpay (UPI, cards, wallets) and the WhatsApp Cloud API, each behind a provider interface. Both have demo providers, so everything works locally with no keys.

## Runs fully offline
The whole product runs on one machine with no internet, no GPU, no Docker, no cloud services and no sound:

| Concern | How it is handled |
|---|---|
| Database | SQLite file (`backend/dineos.db`), created and seeded on first start. PostgreSQL is optional |
| Realtime | In-process WebSocket hub. Redis is optional and only needed for several API instances |
| Payments | `PAYMENT_PROVIDER=mock` (default): a demo gateway in the browser. Razorpay is opt-in |
| WhatsApp invoices | `WHATSAPP_PROVIDER=console` (default): the message is logged and recorded as `simulated` |
| Invoice PDFs and QR codes | Generated locally with ReportLab and qrcode |
| Fonts and assets | System font stack; no web fonts, CDNs or remote images |
| Alerts | Every alert is an on-screen toast. The Web Audio chime is extra and can be muted |
| UI | Web apps opened in the browser at `localhost` |

The only steps that need a network are the one-time `pip install` and `npm install`. Links to `wa.me` and Google Maps are plain links that a guest may choose to open.

**Demo data is made up.** The restaurant, people, addresses, GSTIN/FSSAI numbers, emails (on the reserved `.example` domain) and phone numbers (`55500 xxxxx`, outside India's mobile range) are all fictional. No real passwords, keys or tokens are used anywhere.

## Run it locally (macOS / Linux; Windows notes inline)

**1. Backend**: http://localhost:8000 (API docs at `/docs`)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0
```
On first start the backend creates `dineos.db` and seeds the demo restaurant **Spice Garden**. The seed includes a menu, 12 tables, 5 staff logins, two weeks of sales history, live tables, and tonight's bookings.

**2. Frontend**: http://localhost:3000
```bash
cd frontend
npm install
npm run dev
```

**3. Try it**

| What | Where |
|---|---|
| Guest at Table T1 (QR flow) | http://localhost:3000/t/demo-t1 (tables `demo-t2`, `demo-r1`, … also work) |
| Storefront: takeaway / delivery / booking | http://localhost:3000/r/spice-garden |
| Dashboard | http://localhost:3000/login, then click a demo role |
| Demo logins (password `demo1234`) | `owner@`, `manager@`, `cashier@`, `waiter@`, `kitchen@` + `demo.dineos.example` |

**Suggested walkthrough:**
1. In one window, open `/t/demo-t1` on a phone-sized view and order.
2. In another window, open the dashboard's **Kitchen display**. The ticket arrives with a chime. Start it, then bump it, and the guest's phone shows "Ready".
3. The guest taps **Bill & pay**, then **Pay at counter**. The cashier sees them in **Billing → At counter**, collects cash, and the guest's phone flips to the invoice with PDF, WhatsApp, and rating options.

**Test on a real phone:** open the dashboard at `http://<your-LAN-IP>:3000`. The QR codes on the **QR codes** page then point to your LAN address, so your phone can scan them directly. The API is reached on the same host at port 8000.

## Tests
```bash
cd backend
.venv/bin/python -m pytest -q          # Windows: .venv\Scripts\python -m pytest -q
```
The end-to-end suite covers:
- QR dine-in through counter cash payment, the invoice PDF, WhatsApp, and feedback
- idempotent ordering
- takeaway with online payment
- the delivery minimum order
- booking with pre-order, "on my way", and seating
- staff WebSocket push
- role guards
- signup with sample data
- tax maths

## Configuration (`backend/.env`, see `.env.example`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | e.g. `postgresql+asyncpg://user:pass@host/dineos` (default: local SQLite) |
| `REDIS_URL` | Enables Redis pub/sub so many API instances share realtime events |
| `JWT_SECRET` | **Change in production** |
| `CORS_ORIGINS` | Comma-separated allowed origins (default `*` for dev) |
| `PUBLIC_APP_URL` / `PUBLIC_API_URL` | Used in QR codes and invoice links |
| `PAYMENT_PROVIDER=razorpay` + `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` | Real UPI and card payments. Point the Razorpay webhook to `/api/v1/public/payments/razorpay/webhook` |
| `WHATSAPP_PROVIDER=meta` + `WHATSAPP_PHONE_NUMBER_ID/ACCESS_TOKEN/INVOICE_TEMPLATE` | Real WhatsApp document messages (needs an approved template with a document header) |
| `SEED_DEMO=false` | Disable the demo tenant |

Frontend: set `NEXT_PUBLIC_API_URL` if the API is not on the same host at port 8000.

## Project layout
```
backend/app
  models/       SQLAlchemy models (restaurant, menu, tables/sessions, orders, billing, reservations)
  schemas/      Pydantic request/response models
  routers/      auth, restaurant/staff/plans/uploads, menu, tables+sessions, orders, billing,
                reservations, analytics, public (guest), ws
  services/     pricing, ordering, billing, payments, whatsapp, invoice_pdf, reservations,
                realtime, scheduler, counters, timeutil
  seed.py       demo tenant
frontend/src
  app/          / (landing), /login, /signup, /t/[token], /r/[slug]{,/checkout,/book,/track/..,/reservation/..},
                /dashboard/{,orders,kitchen,tables,billing,reservations,menu,qr,staff,settings}
  components/   ui kit, menu browser + cart, bill/invoice, payment gateway, dashboard widgets
  lib/          api client, auth/cart stores, realtime hook, formatting, types
```

## Before going live (production checklist)
Not needed for local development. Everything above runs offline; this list is only for a hosted deployment.
- PostgreSQL + Alembic migrations (`alembic init`; the models are migration-ready with naming conventions), Redis, S3 for uploads and invoices
- Real `JWT_SECRET`, a strict `CORS_ORIGINS`, HTTPS, and rate limiting on public endpoints
- Razorpay live keys + webhook; WhatsApp Business verification + an approved invoice template
- Move the scheduler and PDF/WhatsApp sends to ARQ/Celery workers; run analytics off a read replica
- Subscription billing via Razorpay Subscriptions (plan switching is already modelled), plus a super-admin console

## Roadmap
Split bill by items, tips, coupons and loyalty, inventory and recipe costing, multi-outlet, aggregator order sync, thermal KOT/receipt printing, offline-first KDS, multi-language menus, and Google review prompts after 5★ feedback.
