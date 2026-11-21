"""Demo tenant: 'Spice Garden' with menu, tables, staff, a week of sales history and a little live activity.

Run standalone:  python -m app.seed
Logins (password demo1234): owner@demo.dineos.example, manager@, cashier@, waiter@, kitchen@
Demo table QR:   http://localhost:3000/t/demo-t1

Every value here is made up: the restaurant, people, addresses, GSTIN/FSSAI numbers, emails (on the reserved
`.example` domain) and phone numbers (55500 xxxxx is outside India's mobile range, so it can't reach anyone).
"""

import asyncio
import random
from datetime import datetime, time, timedelta

from sqlalchemy import select

from app.db import SessionLocal, init_db, utcnow
from app.models import (
    Bill,
    DiningSession,
    Feedback,
    MenuItem,
    Order,
    OrderItem,
    Payment,
    Reservation,
    Restaurant,
    ServiceRequest,
    User,
)
from app.models.billing import BillStatus, PaymentStatus
from app.models.orders import OrderStatus
from app.models.reservations import ReservationStatus
from app.models.restaurant import Role
from app.models.tables import SessionStatus
from app.sample_data import add_sample_menu, add_sample_tables
from app.security import hash_password, short_code
from app.services.billing import recompute
from app.services.counters import next_value
from app.services.restaurants import create_restaurant_with_owner
from app.services.timeutil import financial_year, local_date, tz

DEMO_SLUG = "spice-garden"
PASSWORD = "demo1234"


async def seed_demo(with_history: bool = True) -> bool:
    async with SessionLocal() as db:
        if await db.scalar(select(Restaurant.id).where(Restaurant.slug == DEMO_SLUG)):
            return False
        restaurant, _owner = await create_restaurant_with_owner(
            db,
            restaurant_name="Spice Garden",
            owner_name="Aarav Mehta",
            email="owner@demo.dineos.example",
            password=PASSWORD,
            phone="+91 55500 00100",
            city="Pune",
            slug=DEMO_SLUG,
            settings={
                "delivery_enabled": True,
                "opening_time": "09:00",
                "closing_time": "02:00",
                "invoice_prefix": "SG",
                "counter_directions": "The billing counter is on your right as you walk towards the entrance.",
                "invoice_footer": "Thank you for dining at Spice Garden!",
            },
        )
        restaurant.tagline = "North Indian · Biryani · Tandoor"
        restaurant.description = "Family-style North Indian kitchen with a rooftop, slow-cooked curries and dum biryani."
        restaurant.cuisines = ["North Indian", "Mughlai", "Biryani"]
        restaurant.address_line = "12, Demo Lane, Shivajinagar"
        restaurant.state = "Maharashtra"
        restaurant.pincode = "411004"
        restaurant.whatsapp_number = "+91 55500 00100"
        restaurant.gstin = "27AAAAA0000A1Z5"
        restaurant.fssai_number = "11500000000000"

        for role, name in [(Role.MANAGER, "Neha Kulkarni"), (Role.CASHIER, "Rohan Shah"),
                           (Role.WAITER, "Imran Shaikh"), (Role.KITCHEN, "Chef Gurpreet")]:
            db.add(User(restaurant_id=restaurant.id, name=name, email=f"{role}@demo.dineos.example",
                        password_hash=hash_password(PASSWORD), role=role))

        items = await add_sample_menu(db, restaurant)
        tables = await add_sample_tables(db, restaurant, tokens={
            label: f"demo-{label.lower()}" for label in ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8",
                                                         "R1", "R2", "R3", "R4"]})
        await db.flush()
        if with_history:
            await _history(db, restaurant, items, tables)
            await _live(db, restaurant, items, tables)
        await db.commit()
        return True


def _line(item: MenuItem, rng: random.Random) -> OrderItem:
    qty = rng.choice([1, 1, 1, 2, 2, 3])
    mods, unit = [], item.price
    for g in item.modifier_groups:
        if g.min_select and g.options:
            opt = rng.choice(g.options)
            mods.append({"group": g.name, "name": opt.name, "price_delta": opt.price_delta})
            unit += opt.price_delta
    return OrderItem(menu_item_id=item.id, name=item.name, diet=item.diet, unit_price=unit, quantity=qty,
                     modifiers=mods, line_total=unit * qty, is_done=True)


async def _history(db, restaurant: Restaurant, items: list[MenuItem], tables) -> None:
    rng = random.Random(42)
    zone = tz(restaurant)
    today = local_date(restaurant)
    now = utcnow()
    popular = [i for i in items if "bestseller" in i.tags] * 3 + items
    comments = ["Loved the butter chicken!", "Quick service, great biryani", "Paying from the table was so easy",
                None, None, "Naan could be softer", "Lovely rooftop vibe", None]

    for day_offset in range(13, -1, -1):
        day = today - timedelta(days=day_offset)
        weekend = day.weekday() >= 4
        count = rng.randint(14, 22) + (8 if weekend else 0)
        for _ in range(count):
            hour = rng.choice([12, 13, 13, 14, 15, 19, 20, 20, 21, 21, 22])
            placed_local = datetime.combine(day, time(hour, rng.randint(0, 59)), tzinfo=zone)
            placed = placed_local.astimezone(now.tzinfo)
            if placed > now - timedelta(minutes=50):
                continue
            kind = rng.choices(["dine_in", "takeaway", "delivery"], weights=[62, 26, 12])[0]
            lines = [_line(rng.choice(popular), rng) for _ in range(rng.randint(2, 5))]
            subtotal = sum(li.line_total for li in lines)
            prep = rng.randint(9, 26)
            number = await next_value(db, restaurant.id, f"order:{day.isoformat()}")
            session = None
            table = rng.choice(tables) if kind == "dine_in" else None
            if table:
                session = DiningSession(restaurant_id=restaurant.id, table_id=table.id, status=SessionStatus.CLOSED,
                                        guest_count=rng.randint(1, table.capacity), opened_at=placed - timedelta(minutes=5),
                                        closed_at=placed + timedelta(minutes=55))
                db.add(session)
                await db.flush()
            order = Order(
                restaurant_id=restaurant.id, session_id=session.id if session else None,
                table_id=table.id if table else None, table_label=table.label if table else None,
                order_type=kind, status=OrderStatus.COMPLETED, number=number,
                source="qr" if kind == "dine_in" else "web",
                customer_name=rng.choice(["Priya", "Rahul", "Ananya", "Vikram", "Sneha", "Arjun", "Kabir", "Meera"]),
                customer_phone=None if kind == "dine_in" else f"55500{rng.randint(10000, 99999)}",
                subtotal=subtotal, item_count=sum(li.quantity for li in lines),
                created_at=placed, fired_at=placed, accepted_at=placed + timedelta(minutes=1),
                ready_at=placed + timedelta(minutes=prep), completed_at=placed + timedelta(minutes=prep + 8),
                delivery_address={"line1": "Flat 4B, Sample Residency", "city": "Pune"} if kind == "delivery" else None,
            )
            order.items = lines
            db.add(order)
            await db.flush()
            paid_at = placed + timedelta(minutes=prep + (40 if kind == "dine_in" else 2))
            bill = Bill(restaurant_id=restaurant.id, session_id=session.id if session else None,
                        order_id=None if session else order.id, order_type=kind,
                        table_label=table.label if table else None, created_at=paid_at,
                        customer_name=order.customer_name, customer_phone=order.customer_phone)
            db.add(bill)
            await db.flush()
            await recompute(db, restaurant, bill)
            method = rng.choices(["upi", "card", "cash"], weights=[55, 20, 25])[0]
            bill.status = BillStatus.PAID
            bill.paid_at = min(paid_at, now - timedelta(minutes=1))
            bill.amount_paid = bill.total
            bill.payment_method = method
            bill.pay_preference = "online" if method in ("upi", "card") and rng.random() < 0.7 else "counter"
            fy = financial_year(bill.paid_at, restaurant)
            seq = await next_value(db, restaurant.id, f"invoice:{fy}")
            bill.invoice_number = f"SG/{fy}/{seq:05d}"
            online = bill.pay_preference == "online"
            db.add(Payment(restaurant_id=restaurant.id, bill_id=bill.id, method=method,
                           provider="mock" if online else "manual", status=PaymentStatus.SUCCEEDED,
                           amount=bill.total, created_at=bill.paid_at, completed_at=bill.paid_at,
                           tendered=(bill.total // 10000 + 1) * 10000 if method == "cash" else None,
                           change_due=((bill.total // 10000 + 1) * 10000 - bill.total) if method == "cash" else None))
            if rng.random() < 0.35:
                db.add(Feedback(restaurant_id=restaurant.id, bill_id=bill.id,
                                rating=rng.choices([5, 4, 3, 2], weights=[60, 28, 9, 3])[0],
                                comment=rng.choice(comments), customer_name=order.customer_name,
                                created_at=bill.paid_at + timedelta(minutes=2)))
    await db.flush()


async def _live(db, restaurant: Restaurant, items: list[MenuItem], tables) -> None:
    """A little activity so the floor, KDS and reservations screens aren't empty on first launch."""
    rng = random.Random(7)
    now = utcnow()
    by_label = {t.label: t for t in tables}
    today = local_date(restaurant)

    async def dine_order(table_label: str, status: str, minutes_ago: int, n: int) -> None:
        table = by_label[table_label]
        session = await db.scalar(select(DiningSession).where(DiningSession.table_id == table.id,
                                                              DiningSession.status == SessionStatus.OPEN))
        if not session:
            session = DiningSession(restaurant_id=restaurant.id, table_id=table.id, guest_count=table.capacity,
                                    guest_name=rng.choice(["Sharma family", "Ishaan", "Tanya"]),
                                    opened_at=now - timedelta(minutes=minutes_ago + 6))
            db.add(session)
            await db.flush()
        lines = [_line(rng.choice(items), rng) for _ in range(n)]
        for li in lines:
            li.is_done = False
        created = now - timedelta(minutes=minutes_ago)
        order = Order(restaurant_id=restaurant.id, session_id=session.id, table_id=table.id, table_label=table.label,
                      order_type="dine_in", status=status, source="qr",
                      number=await next_value(db, restaurant.id, f"order:{today.isoformat()}"),
                      subtotal=sum(li.line_total for li in lines), item_count=sum(li.quantity for li in lines),
                      created_at=created, fired_at=created,
                      accepted_at=created + timedelta(minutes=1) if status != OrderStatus.PLACED else None,
                      ready_at=now - timedelta(minutes=1) if status in (OrderStatus.READY, OrderStatus.SERVED) else None)
        order.items = lines
        db.add(order)
        await db.flush()

    await dine_order("T3", OrderStatus.SERVED, 34, 3)
    await dine_order("T3", OrderStatus.PREPARING, 8, 2)
    await dine_order("T6", OrderStatus.READY, 16, 4)
    await dine_order("R2", OrderStatus.PLACED, 2, 3)
    db.add(ServiceRequest(restaurant_id=restaurant.id, table_id=by_label["T6"].id,
                          session_id=(await db.scalar(select(DiningSession.id).where(
                              DiningSession.table_id == by_label["T6"].id, DiningSession.status == SessionStatus.OPEN))),
                          kind="water", created_at=now - timedelta(minutes=1)))

    takeaway_lines = [_line(items[11], rng), _line(items[19], rng)]
    for li in takeaway_lines:
        li.is_done = False
    t_order = Order(restaurant_id=restaurant.id, order_type="takeaway", status=OrderStatus.PREPARING, source="web",
                    number=await next_value(db, restaurant.id, f"order:{today.isoformat()}"),
                    customer_name="Kabir", customer_phone="5550001234",
                    subtotal=sum(li.line_total for li in takeaway_lines),
                    item_count=sum(li.quantity for li in takeaway_lines),
                    created_at=now - timedelta(minutes=6), fired_at=now - timedelta(minutes=6),
                    accepted_at=now - timedelta(minutes=5))
    t_order.items = takeaway_lines
    db.add(t_order)
    await db.flush()
    t_bill = Bill(restaurant_id=restaurant.id, order_id=t_order.id, order_type="takeaway", pay_preference="counter",
                  customer_name="Kabir", customer_phone="5550001234")
    db.add(t_bill)
    await db.flush()
    await recompute(db, restaurant, t_bill)

    # Tonight's bookings: one with a pre-order the kitchen will see in "Upcoming"
    zone = tz(restaurant)
    local_now = now.astimezone(zone)
    slot = (local_now + timedelta(hours=2)).replace(minute=0 if local_now.minute < 30 else 30, second=0, microsecond=0)
    bookings = [("Riya Desai", 4, "Birthday", slot, True), ("Karan Malhotra", 2, "Anniversary",
                                                           slot + timedelta(minutes=60), False)]
    for name, size, occasion, when, with_pre in bookings:
        res = Reservation(restaurant_id=restaurant.id, code=short_code(6), customer_name=name,
                          customer_phone=f"55500{rng.randint(10000, 99999)}", party_size=size,
                          reserved_for=when, duration_minutes=90, status=ReservationStatus.CONFIRMED,
                          occasion=occasion, notes="Window seat if possible" if with_pre else None)
        db.add(res)
        await db.flush()
        if with_pre:
            pre_lines = [_line(items[5], rng), _line(items[14], rng), _line(items[18], rng)]
            for li in pre_lines:
                li.is_done = False
            pre = Order(restaurant_id=restaurant.id, reservation_id=res.id, order_type="dine_in",
                        status=OrderStatus.SCHEDULED, source="reservation",
                        number=await next_value(db, restaurant.id, f"order:{today.isoformat()}"),
                        customer_name=name, subtotal=sum(li.line_total for li in pre_lines),
                        item_count=sum(li.quantity for li in pre_lines), created_at=now - timedelta(hours=3),
                        scheduled_for=when - timedelta(minutes=25))
            pre.items = pre_lines
            db.add(pre)
            await db.flush()
            res.preorder_order_id = pre.id


async def _main() -> None:
    await init_db()
    created = await seed_demo()
    print("Seeded demo restaurant 'spice-garden'" if created else "Demo restaurant already exists")


if __name__ == "__main__":
    asyncio.run(_main())
