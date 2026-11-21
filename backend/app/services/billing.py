import logging
from collections import OrderedDict

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.db import utcnow
from app.models import Bill, DiningSession, Feedback, Order, Payment, Reservation, Restaurant
from app.models.billing import BillStatus, PaymentStatus
from app.models.orders import OrderStatus, OrderType
from app.models.reservations import ReservationStatus
from app.models.tables import SessionStatus
from app.schemas.billing import BillDetailOut, BillLineOut, PaymentOut
from app.security import create_invoice_token
from app.services import realtime
from app.services.counters import next_value
from app.services.ordering import apply_transition, emit_order, settings_of
from app.services.payments import get_provider
from app.services.pricing import compute_totals
from app.services.timeutil import financial_year

log = logging.getLogger("dineos.billing")


async def bill_orders(db: AsyncSession, bill: Bill) -> list[Order]:
    if bill.session_id:
        stmt = select(Order).where(Order.session_id == bill.session_id)
    elif bill.order_id:
        stmt = select(Order).where(Order.id == bill.order_id)
    else:
        return []
    orders = (await db.scalars(stmt.order_by(Order.created_at))).all()
    return [o for o in orders if o.status != OrderStatus.CANCELLED]


async def recompute(db: AsyncSession, restaurant: Restaurant, bill: Bill) -> Bill:
    if bill.status != BillStatus.OPEN:
        return bill
    orders = await bill_orders(db, bill)
    subtotal = sum(o.subtotal for o in orders)
    discount = bill.discount
    if bill.discount_percent:
        discount = round(subtotal * bill.discount_percent / 100)
    s = settings_of(restaurant)
    delivery_fee = s.delivery_fee if bill.order_type == OrderType.DELIVERY else 0
    totals = compute_totals(subtotal, s, discount=discount, delivery_fee=delivery_fee)
    bill.subtotal = totals.subtotal
    bill.discount = totals.discount
    bill.service_charge = totals.service_charge
    bill.taxes = totals.taxes
    bill.tax_total = totals.tax_total
    bill.delivery_fee = totals.delivery_fee
    bill.round_off = totals.round_off
    bill.total = totals.total
    return bill


async def open_bill_for_session(db: AsyncSession, session_id: str) -> Bill | None:
    return await db.scalar(
        select(Bill).where(Bill.session_id == session_id, Bill.status == BillStatus.OPEN).order_by(Bill.created_at.desc())
    )


async def latest_bill_for_session(db: AsyncSession, session_id: str) -> Bill | None:
    return await db.scalar(
        select(Bill)
        .where(Bill.session_id == session_id, Bill.status != BillStatus.VOID)
        .order_by(Bill.created_at.desc())
    )


async def ensure_session_bill(
    db: AsyncSession, restaurant: Restaurant, session: DiningSession, table_label: str | None
) -> Bill:
    bill = await open_bill_for_session(db, session.id)
    if not bill:
        bill = Bill(
            restaurant_id=restaurant.id,
            session_id=session.id,
            order_type=OrderType.DINE_IN,
            table_label=table_label,
            customer_name=session.guest_name,
            customer_phone=session.customer_phone,
        )
        db.add(bill)
        await db.flush()
    await recompute(db, restaurant, bill)
    if bill.total == 0:
        raise HTTPException(409, "There is nothing to bill yet — place an order first")
    return bill


async def ensure_order_bill(db: AsyncSession, restaurant: Restaurant, order: Order) -> Bill:
    bill = await db.scalar(select(Bill).where(Bill.order_id == order.id, Bill.status != BillStatus.VOID))
    if not bill:
        bill = Bill(
            restaurant_id=restaurant.id,
            order_id=order.id,
            order_type=order.order_type,
            table_label=order.table_label,
            customer_name=order.customer_name,
            customer_phone=order.customer_phone,
        )
        db.add(bill)
        await db.flush()
    await recompute(db, restaurant, bill)
    return bill


async def bill_lines(db: AsyncSession, bill: Bill) -> list[BillLineOut]:
    """Merge identical lines across rounds (same item, options and price) for a clean invoice."""
    merged: OrderedDict[tuple, BillLineOut] = OrderedDict()
    for order in await bill_orders(db, bill):
        for item in order.items:
            mods = [m["name"] for m in (item.modifiers or [])]
            key = (item.menu_item_id, item.name, item.unit_price, tuple(mods))
            if key in merged:
                merged[key].quantity += item.quantity
                merged[key].line_total += item.line_total
            else:
                merged[key] = BillLineOut(
                    name=item.name,
                    diet=item.diet,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                    modifiers=mods,
                )
    return list(merged.values())


def invoice_url(bill: Bill) -> str:
    return f"{app_settings.public_api_url}/api/v1/public/bills/{bill.id}/invoice.pdf?token={create_invoice_token(bill.id)}"


async def to_detail(db: AsyncSession, bill: Bill) -> BillDetailOut:
    # Build from columns + an explicit payments query: never trigger async lazy-loads on fresh objects.
    payments = (await db.scalars(select(Payment).where(Payment.bill_id == bill.id).order_by(Payment.created_at))).all()
    data = {col.key: getattr(bill, col.key) for col in Bill.__table__.columns}
    detail = BillDetailOut.model_validate({**data, "payments": [PaymentOut.model_validate(p) for p in payments]})
    detail.lines = await bill_lines(db, bill)
    if bill.status == BillStatus.PAID:
        detail.invoice_url = invoice_url(bill)
        detail.has_feedback = bool(await db.scalar(select(Feedback.id).where(Feedback.bill_id == bill.id)))
    return detail


def amount_due(bill: Bill) -> int:
    return max(bill.total - bill.amount_paid, 0)


def bill_channels(bill: Bill) -> list[str | None]:
    return [
        realtime.staff_channel(bill.restaurant_id),
        realtime.session_channel(bill.session_id) if bill.session_id else None,
        realtime.order_channel(bill.order_id) if bill.order_id else None,
    ]


async def emit_bill(bill: Bill, event: str = "bill.updated") -> None:
    await realtime.emit(
        bill_channels(bill),
        event,
        {
            "bill_id": bill.id,
            "status": bill.status,
            "total": bill.total,
            "pay_preference": bill.pay_preference,
            "table_label": bill.table_label,
            "session_id": bill.session_id,
            "order_id": bill.order_id,
        },
    )


async def _settle(db: AsyncSession, restaurant: Restaurant, bill: Bill) -> list[Order]:
    """Mark the bill paid; close the table session; release prepaid takeaway orders to the kitchen."""
    now = utcnow()
    bill.status = BillStatus.PAID
    bill.paid_at = now
    fy = financial_year(now, restaurant)
    seq = await next_value(db, restaurant.id, f"invoice:{fy}")
    bill.invoice_number = f"{settings_of(restaurant).invoice_prefix}/{fy}/{seq:05d}"

    touched: list[Order] = []
    for order in await bill_orders(db, bill):
        if order.status == OrderStatus.PENDING_PAYMENT:
            apply_transition(order, OrderStatus.PLACED, restaurant)
            touched.append(order)
        elif order.status == OrderStatus.SERVED:
            apply_transition(order, OrderStatus.COMPLETED, restaurant)
            touched.append(order)

    if bill.session_id:
        session = await db.get(DiningSession, bill.session_id)
        if session and session.status != SessionStatus.CLOSED:
            session.status = SessionStatus.CLOSED
            session.closed_at = now
            if session.reservation_id:
                reservation = await db.get(Reservation, session.reservation_id)
                if reservation and reservation.status == ReservationStatus.SEATED:
                    reservation.status = ReservationStatus.COMPLETED
    return touched


async def record_success(
    db: AsyncSession,
    restaurant: Restaurant,
    bill: Bill,
    payment: Payment,
    *,
    provider_payment_id: str | None = None,
    method: str | None = None,
) -> bool:
    """Idempotently mark a payment succeeded. Returns True if the bill became fully paid by this call."""
    if payment.status == PaymentStatus.SUCCEEDED:
        return False
    payment.status = PaymentStatus.SUCCEEDED
    payment.completed_at = utcnow()
    if provider_payment_id:
        payment.provider_payment_id = provider_payment_id
    if method:
        payment.method = method
    bill.amount_paid += payment.amount
    bill.payment_method = payment.method if bill.payment_method in (None, payment.method) else "split"
    became_paid = False
    touched: list[Order] = []
    if bill.status == BillStatus.OPEN and bill.amount_paid >= bill.total:
        touched = await _settle(db, restaurant, bill)
        became_paid = True
    await db.commit()

    for order in touched:
        await emit_order(order, "order.created" if order.status in (OrderStatus.PLACED, OrderStatus.PREPARING) else "order.updated")
    await emit_bill(bill, "payment.succeeded" if became_paid else "bill.updated")
    if bill.session_id:
        await realtime.emit([realtime.staff_channel(bill.restaurant_id), realtime.session_channel(bill.session_id)],
                            "session.updated", {"session_id": bill.session_id})
    return became_paid


async def start_online_payment(db: AsyncSession, restaurant: Restaurant, bill: Bill) -> Payment:
    due = amount_due(bill)
    if due <= 0:
        raise HTTPException(409, "This bill is already paid")
    provider = get_provider()
    gateway = await provider.create_order(
        amount=due,
        currency=restaurant.currency,
        receipt=f"bill_{bill.id}",
        notes={"bill_id": bill.id, "restaurant": restaurant.slug},
    )
    payment = Payment(
        restaurant_id=restaurant.id,
        bill_id=bill.id,
        method="online",
        provider=provider.name,
        status=PaymentStatus.CREATED,
        amount=due,
        provider_order_id=gateway.provider_order_id,
        meta={"key_id": gateway.key_id},
    )
    bill.pay_preference = "online"
    db.add(payment)
    await db.flush()
    return payment


async def collect_at_counter(
    db: AsyncSession,
    restaurant: Restaurant,
    bill: Bill,
    *,
    method: str,
    tendered: int | None,
    collected_by: str | None,
) -> Payment:
    if bill.status != BillStatus.OPEN:
        raise HTTPException(409, "Bill is not open")
    await recompute(db, restaurant, bill)
    due = amount_due(bill)
    if due <= 0:
        raise HTTPException(409, "Nothing due on this bill")
    change = None
    if method == "cash":
        if tendered is not None and tendered < due:
            raise HTTPException(422, "Cash tendered is less than the amount due")
        change = (tendered - due) if tendered is not None else 0
    payment = Payment(
        restaurant_id=restaurant.id,
        bill_id=bill.id,
        method=method,
        provider="manual",
        status=PaymentStatus.CREATED,
        amount=due,
        tendered=tendered,
        change_due=change,
        collected_by=collected_by,
    )
    db.add(payment)
    await db.flush()
    await record_success(db, restaurant, bill, payment)
    return payment


async def load_bill(db: AsyncSession, restaurant_id: str, bill_id: str) -> Bill:
    bill = await db.scalar(select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == restaurant_id))
    if not bill:
        raise HTTPException(404, "Bill not found")
    return bill
