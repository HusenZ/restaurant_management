"""Background loop (in production run the same jobs from ARQ/Celery workers).

- Fires scheduled pre-orders whose time has come (only for confirmed reservations).
- Expires online-payment orders that were never paid.
"""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal, utcnow
from app.models import Bill, Order, Reservation, Restaurant
from app.models.billing import BillStatus
from app.models.orders import OrderStatus
from app.models.reservations import ReservationStatus
from app.services.billing import emit_bill
from app.services.ordering import apply_transition, emit_order

log = logging.getLogger("dineos.scheduler")


async def run_once() -> dict[str, int]:
    fired: list[Order] = []
    expired: list[Order] = []
    voided: list[Bill] = []
    async with SessionLocal() as db:
        now = utcnow()
        due = (
            await db.scalars(
                select(Order).where(Order.status == OrderStatus.SCHEDULED, Order.scheduled_for <= now).limit(200)
            )
        ).all()
        for order in due:
            if order.reservation_id:
                reservation = await db.get(Reservation, order.reservation_id)
                if not reservation or reservation.status not in (ReservationStatus.CONFIRMED, ReservationStatus.SEATED):
                    continue
            restaurant = await db.get(Restaurant, order.restaurant_id)
            apply_transition(order, OrderStatus.PLACED, restaurant)
            fired.append(order)

        cutoff = now - timedelta(minutes=settings.online_payment_expiry_minutes)
        stale = (
            await db.scalars(
                select(Order).where(Order.status == OrderStatus.PENDING_PAYMENT, Order.created_at < cutoff).limit(200)
            )
        ).all()
        for order in stale:
            restaurant = await db.get(Restaurant, order.restaurant_id)
            apply_transition(order, OrderStatus.CANCELLED, restaurant, reason="Payment not completed")
            expired.append(order)
            bill = await db.scalar(select(Bill).where(Bill.order_id == order.id, Bill.status == BillStatus.OPEN))
            if bill:
                bill.status = BillStatus.VOID
                voided.append(bill)
        await db.commit()

    for order in fired:
        await emit_order(order, "order.created")
    for order in expired:
        await emit_order(order)
    for bill in voided:
        await emit_bill(bill)
    return {"fired": len(fired), "expired": len(expired)}


async def loop() -> None:
    while True:
        try:
            result = await run_once()
            if any(result.values()):
                log.info("scheduler: %s", result)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("scheduler tick failed")
        await asyncio.sleep(settings.scheduler_interval_seconds)
