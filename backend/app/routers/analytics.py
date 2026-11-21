"""Owner analytics. Aggregation happens in Python for DB portability; at scale this moves to SQL on a read
replica / materialised daily rollups (see docs/02-architecture-hld.md)."""

from collections import Counter, defaultdict
from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import Staff
from app.models import Bill, DiningSession, Feedback, Order, Payment, ServiceRequest
from app.models.billing import BillStatus, PaymentStatus
from app.models.orders import OrderStatus
from app.models.tables import SessionStatus
from app.services.timeutil import day_bounds_utc, local_date, tz

router = APIRouter(prefix="/analytics", tags=["analytics"])

EXCLUDED = (OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT)


def _pct(curr: float, prev: float) -> float | None:
    if not prev:
        return None
    return round((curr - prev) / prev * 100, 1)


@router.get("/summary")
async def summary(ctx: Staff, days: int = 7):
    days = max(1, min(days, 90))
    r = ctx.restaurant
    db = ctx.db
    zone = tz(r)
    today = local_date(r)
    start_day = today - timedelta(days=days - 1)
    start, _ = day_bounds_utc(r, start_day)
    _, end = day_bounds_utc(r, today)
    prev_start, _ = day_bounds_utc(r, start_day - timedelta(days=days))

    bills = (await db.scalars(
        select(Bill).where(Bill.restaurant_id == r.id, Bill.status == BillStatus.PAID, Bill.paid_at >= prev_start,
                           Bill.paid_at < end)
    )).all()
    orders = (await db.scalars(
        select(Order).where(Order.restaurant_id == r.id, Order.created_at >= prev_start, Order.created_at < end,
                            Order.status.not_in(EXCLUDED))
    )).all()

    cur_bills = [b for b in bills if b.paid_at >= start]
    prev_bills = [b for b in bills if b.paid_at < start]
    cur_orders = [o for o in orders if o.created_at >= start]
    prev_orders = [o for o in orders if o.created_at < start]

    revenue = sum(b.total for b in cur_bills)
    prev_revenue = sum(b.total for b in prev_bills)
    aov = revenue // len(cur_bills) if cur_bills else 0
    prev_aov = prev_revenue // len(prev_bills) if prev_bills else 0

    chart_days = max(days, 7)
    daily: dict[str, dict] = {}
    for i in range(chart_days - 1, -1, -1):
        d = today - timedelta(days=i)
        daily[d.isoformat()] = {"date": d.isoformat(), "label": d.strftime("%a %d"), "revenue": 0, "orders": 0}
    chart_start, _ = day_bounds_utc(r, today - timedelta(days=chart_days - 1))
    chart_bills = bills if chart_days == days else (await db.scalars(
        select(Bill).where(Bill.restaurant_id == r.id, Bill.status == BillStatus.PAID, Bill.paid_at >= chart_start)
    )).all()
    chart_orders = orders if chart_days == days else (await db.scalars(
        select(Order).where(Order.restaurant_id == r.id, Order.created_at >= chart_start, Order.status.not_in(EXCLUDED))
    )).all()
    for b in chart_bills:
        key = b.paid_at.astimezone(zone).date().isoformat()
        if key in daily:
            daily[key]["revenue"] += b.total
    for o in chart_orders:
        key = o.created_at.astimezone(zone).date().isoformat()
        if key in daily:
            daily[key]["orders"] += 1

    hourly = [{"hour": h, "label": f"{(h % 12) or 12}{'a' if h < 12 else 'p'}", "orders": 0} for h in range(24)]
    for o in cur_orders:
        hourly[o.created_at.astimezone(zone).hour]["orders"] += 1

    items: dict[str, dict] = defaultdict(lambda: {"name": "", "quantity": 0, "revenue": 0})
    for o in cur_orders:
        for it in o.items:
            row = items[it.name]
            row["name"] = it.name
            row["quantity"] += it.quantity
            row["revenue"] += it.line_total
    top_items = sorted(items.values(), key=lambda x: (-x["quantity"], -x["revenue"]))[:8]

    by_type: dict[str, dict] = {t: {"type": t, "orders": 0, "revenue": 0} for t in ("dine_in", "takeaway", "delivery")}
    for o in cur_orders:
        by_type.setdefault(o.order_type, {"type": o.order_type, "orders": 0, "revenue": 0})
        by_type[o.order_type]["orders"] += 1
        by_type[o.order_type]["revenue"] += o.subtotal

    bill_ids = [b.id for b in cur_bills]
    methods: Counter = Counter()
    if bill_ids:
        for p in (await db.scalars(
            select(Payment).where(Payment.bill_id.in_(bill_ids), Payment.status == PaymentStatus.SUCCEEDED)
        )).all():
            methods[p.method] += p.amount

    prep = [(o.ready_at - (o.fired_at or o.created_at)).total_seconds() / 60 for o in cur_orders
            if o.ready_at and (o.fired_at or o.created_at)]
    avg_prep = round(sum(prep) / len(prep), 1) if prep else None

    rating = (await db.execute(
        select(func.avg(Feedback.rating), func.count(Feedback.id))
        .where(Feedback.restaurant_id == r.id, Feedback.created_at >= start)
    )).one()

    live_sessions = await db.scalar(select(func.count(DiningSession.id)).where(
        DiningSession.restaurant_id == r.id, DiningSession.status.in_(SessionStatus.ACTIVE))) or 0
    live_orders = await db.scalar(select(func.count(Order.id)).where(
        Order.restaurant_id == r.id, Order.status.in_(OrderStatus.KITCHEN_ACTIVE))) or 0
    counter_bills = await db.scalar(select(func.count(Bill.id)).where(
        Bill.restaurant_id == r.id, Bill.status == BillStatus.OPEN, Bill.pay_preference == "counter")) or 0
    open_requests = await db.scalar(select(func.count(ServiceRequest.id)).where(
        ServiceRequest.restaurant_id == r.id, ServiceRequest.status == "open")) or 0

    return {
        "range": {"days": days, "from": start_day.isoformat(), "to": today.isoformat()},
        "kpis": {
            "revenue": revenue, "revenue_change": _pct(revenue, prev_revenue),
            "orders": len(cur_orders), "orders_change": _pct(len(cur_orders), len(prev_orders)),
            "aov": aov, "aov_change": _pct(aov, prev_aov),
            "bills": len(cur_bills),
            "avg_prep_minutes": avg_prep,
            "rating": round(float(rating[0]), 2) if rating[0] else None,
            "ratings_count": rating[1],
        },
        "live": {"occupied_tables": live_sessions, "kitchen_orders": live_orders, "counter_queue": counter_bills,
                 "open_requests": open_requests},
        "daily": list(daily.values()),
        "hourly": hourly,
        "top_items": top_items,
        "by_type": list(by_type.values()),
        "payment_methods": [{"method": m, "amount": a} for m, a in methods.most_common()],
    }
