# DineOS — UI / UX Design

## 1. Principles
1. **Thumb-first for guests.** Every primary action sits in the bottom 40 % of the screen: cart bar, bottom sheets, sticky pay buttons.
2. **Zero friction.** No login, no app, no OTP to order. Name and phone are optional and asked for only when they add value (invoice on WhatsApp).
3. **Always show status.** Every order round, payment, and request has a live state; nothing is fire-and-forget.
4. **Glanceable for staff.** Status is colour plus label plus icon (never colour alone); ticket age escalates green → amber → red.
5. **Brandable.** Each restaurant sets a theme colour; the guest UI is driven by a `--brand` CSS variable.
6. **Fast on cheap phones.** No heavy UI framework, system-font fallback, images lazy-loaded, menu cached.

## 2. Competitor patterns we adopt (and improve)

| Pattern | Seen in | Our take |
|---|---|---|
| Veg/non-veg square-dot icons, veg-only toggle | Swiggy, Zomato | Same FSSAI-style icons; toggle persists per guest |
| Sticky category chips + scroll-spy | Swiggy, Toast online ordering | Chips with category emoji; the active chip follows scroll |
| "ADD" button overlapping the item image, turning into a stepper | Swiggy | Same muscle memory; works without images too (emoji tile) |
| Bottom sheet for variants/add-ons with live price | Zomato, Domino's | Required groups flagged, button shows the final price |
| Floating cart bar "2 items · ₹540 | View cart" | Swiggy, Uber Eats | Plus a table chip on dine-in so guests know where it's going |
| Order progress stepper | Zomato, Domino's tracker | Per round for dine-in; token number for takeaway |
| KDS tickets with age colours and bump | Toast KDS, Square KDS | Item-level strike-through, "Upcoming pre-orders" lane |
| Floor plan with table status colours | Petpooja, Toast | Adds "awaiting counter payment" and "needs attention" (waiter call) states |
| Pricing page with 3 tiers, highlighted middle plan | Toast, Square | Monthly/yearly toggle; 0 % commission called out |

**Improvements no one ships together:** shared table session across phones, a guided "go to counter" screen synced with the cashier, "I'm on my way" pre-order firing, and WhatsApp invoices with a share fallback.

## 3. Design tokens

| Token | Value | Use |
|---|---|---|
| `--brand` | `#E8590C` (default, per restaurant) | Primary actions, active states |
| Neutrals | Tailwind `stone` (guest), `zinc` (dashboard) | Warm guest UI, crisp dashboard |
| Success / warning / danger / info | emerald-600 / amber-500 / rose-600 / sky-600 | Statuses |
| Veg / Non-veg / Egg | `#16A34A` / `#B91C1C` / `#CA8A04` | Diet icons |
| Radius | 12 px controls, 16–24 px cards and sheets | Friendly, modern |
| Type | System font stack (no web-font download, works offline), tabular numbers for money | Legible on low-DPI screens |
| Elevation | 1 soft shadow for cards, 1 strong shadow for sheets and cart bar | Clear layering |
| Motion | 150–250 ms ease-out; sheets slide up; success check animates | Feedback without lag |

## 3a. Light & dark themes
- Semantic tokens in `frontend/src/app/globals.css` (`bg`, `surface`, `surface-2/3`, `line-soft/line/line-strong`, `fg`, `fg-2`, `muted`, `subtle`, `inverse`) switch values under `[data-theme="dark"]`. Components use only these, never raw greys.
- An inline `<head>` script (`src/lib/theme-script.ts`) applies the saved preference before first paint. `ThemeToggle` cycles Light → Dark → System and follows OS changes when set to System.
- Tinted status colours get explicit `dark:` variants (translucent tints with light text). Brand shades are mixed with the active surface, so restaurant colours stay legible in both themes.
- The kitchen display is always dark (high contrast in kitchens). Dark mode uses deeper shadows plus hairline borders instead of light-mode drop shadows.

## 4. Screen inventory

### Guest
| Route | Screen | Notes |
|---|---|---|
| `/t/{qr}` | Welcome → Menu / My table / Bill tabs | One QR; tabs at the bottom; "Call waiter" button |
| | Item sheet | Variants, add-ons, notes, live price |
| | Cart sheet | Steppers, kitchen notes, "Send to kitchen" |
| | My table | All rounds from every phone, live status chips |
| | Bill | Itemised, taxes, split-evenly helper, Pay online / Pay at counter |
| | Counter screen | Bill number, amount, table, directions, waiting pulse; auto-advances when the cashier settles |
| | Success | Animated check, invoice number, Download PDF, WhatsApp, Share, Rate |
| `/r/{slug}` | Storefront | Cover, info, open/closed, Takeaway / Delivery / Book a table |
| `/r/{slug}/checkout` | Checkout | Pickup time, contact, address, pay mode |
| `/r/{slug}/track/{id}` | Tracking | Big token number, stepper, bill, invoice |
| `/r/{slug}/book` | Booking wizard | Party → date → slot → details → optional pre-order |
| `/r/{slug}/reservation/{id}` | Reservation | Status, pre-order, "I'm on my way", cancel, add to calendar |

### Staff
| Route | Screen |
|---|---|
| `/` | Marketing landing + pricing |
| `/signup`, `/login` | Owner onboarding (sample data on signup), staff login |
| `/dashboard` | Overview: KPIs, 7-day revenue, hourly orders, top items, splits, onboarding checklist |
| `/dashboard/orders` | Live board: New / Preparing / Ready (+ completed), filters, sound alerts |
| `/dashboard/kitchen` | Dark full-screen KDS with upcoming pre-orders |
| `/dashboard/tables` | Floor view by area + session drawer (orders, requests, bill, collect, close) |
| `/dashboard/billing` | Counter queue, open bills, paid invoices; collect dialog with change calculator |
| `/dashboard/reservations` | Day view, confirm/seat/no-show/cancel, pre-order preview |
| `/dashboard/menu` | Categories + items, availability switches, item editor with modifier groups |
| `/dashboard/qr` | Per-table QR cards, PNG download, printable PDF sheet |
| `/dashboard/staff` | Staff list, roles, activate/deactivate |
| `/dashboard/settings` | Profile, ordering, taxes & charges, reservations, payments/WhatsApp status, subscription |

## 5. Interaction details
- **Alerts**: every new order, waiter call and counter payment raises an on-screen toast. A short Web Audio chime (no file) plays too where audio is available; nothing depends on it. Mute toggle in the top bar.
- **Optimistic UI** for availability toggles and KDS bumps; rollback with a toast on error.
- **Empty states** with a clear next action ("No tables yet → Add tables").
- **Accessibility**: 44 px touch targets, focus rings, `aria-live` for order status, colour + text for every status.
- **Resilience**: a connection dot in the dashboard header (green live / amber reconnecting); guests see "Updating…" and pages fall back to polling.
