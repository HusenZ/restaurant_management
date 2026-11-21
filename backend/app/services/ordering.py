from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import utcnow
from app.models import DiningSession, DiningTable, Order, OrderItem, Restaurant
from app.models.orders import OrderStatus as S
from app.models.orders import OrderType
from app.schemas.restaurant import RestaurantSettings
from app.services import realtime
from app.services.counters import next_value
from app.services.pricing import PricedLine
from app.services.timeutil import local_date

TRANSITIONS: dict[str, set[str]] = {
    S.PENDING_PAYMENT: {S.PLACED, S.CANCELLED},
    S.SCHEDULED: {S.PLACED, S.PREPARING, S.CANCELLED},
    S.PLACED: {S.PREPARING, S.READY, S.CANCELLED},
    S.PREPARING: {S.READY, S.CANCELLED},
    S.READY: {S.SERVED, S.OUT_FOR_DELIVERY, S.COMPLETED, S.PREPARING},
    S.OUT_FOR_DELIVERY: {S.COMPLETED},
    S.SERVED: {S.COMPLETED},
    S.COMPLETED: set(),
    S.CANCELLED: set(),
}

FINAL_AFTER_READY = {
    OrderType.DINE_IN: S.SERVED,
    OrderType.TAKEAWAY: S.COMPLETED,
    OrderType.DELIVERY: S.OUT_FOR_DELIVERY,
}


def settings_of(restaurant: Restaurant) -> RestaurantSettings:
    return RestaurantSettings.model_validate(restaurant.settings or {})


async def find_by_client_id(db: AsyncSession, restaurant_id: str, client_order_id: str | None) -> Order | None:
    if not client_order_id:
        return None
    return await db.scalar(
        select(Order).where(Order.restaurant_id == restaurant_id, Order.client_order_id == client_order_id)
    )


async def create_order(
    db: AsyncSession,
    restaurant: Restaurant,
    *,
    lines: list[PricedLine],
    order_type: str,
    source: str,
    status: str = S.PLACED,
    session: DiningSession | None = None,
    table: DiningTable | None = None,
    customer_name: str | None = None,
    customer_phone: str | None = None,
    notes: str | None = None,
    delivery_address: dict | None = None,
    scheduled_for: datetime | None = None,
    reservation_id: str | None = None,
    client_order_id: str | None = None,
) -> Order:
    now = utcnow()
    number = await next_value(db, restaurant.id, f"order:{local_date(restaurant).isoformat()}")
    order = Order(
        restaurant_id=restaurant.id,
        session_id=session.id if session else None,
        table_id=table.id if table else None,
        table_label=table.label if table else None,
        reservation_id=reservation_id,
        order_type=order_type,
        status=status,
        number=number,
        source=source,
        customer_name=customer_name,
        customer_phone=customer_phone,
        notes=notes or None,
        delivery_address=delivery_address,
        scheduled_for=scheduled_for,
        client_order_id=client_order_id,
        subtotal=sum(line.line_total for line in lines),
        item_count=sum(line.quantity for line in lines),
        created_at=now,
    )
    order.items = [
        OrderItem(
            menu_item_id=line.menu_item_id,
            name=line.name,
            diet=line.diet,
            unit_price=line.unit_price,
            quantity=line.quantity,
            modifiers=line.modifiers,
            notes=line.notes,
            line_total=line.line_total,
        )
        for line in lines
    ]
    if status == S.PLACED:
        order.fired_at = now
        if settings_of(restaurant).auto_accept_orders:
            order.status = S.PREPARING
            order.accepted_at = now
    db.add(order)
    await db.flush()
    return order


def apply_transition(order: Order, new_status: str, restaurant: Restaurant, reason: str | None = None) -> None:
    if new_status not in TRANSITIONS:
        raise HTTPException(422, f"Unknown status '{new_status}'")
    if new_status == order.status:
        return
    allowed = TRANSITIONS.get(order.status, set())
    if new_status not in allowed:
        raise HTTPException(409, f"Cannot move order from {order.status} to {new_status}")
    if new_status == S.SERVED and order.order_type != OrderType.DINE_IN:
        raise HTTPException(409, "Only dine-in orders can be marked served")
    if new_status == S.OUT_FOR_DELIVERY and order.order_type != OrderType.DELIVERY:
        raise HTTPException(409, "Only delivery orders can go out for delivery")

    now = utcnow()
    order.status = new_status
    if new_status == S.PLACED:
        order.fired_at = order.fired_at or now
        if settings_of(restaurant).auto_accept_orders:
            order.status = S.PREPARING
            order.accepted_at = now
    elif new_status == S.PREPARING:
        order.accepted_at = order.accepted_at or now
        order.fired_at = order.fired_at or now
    elif new_status == S.READY:
        order.ready_at = now
        order.accepted_at = order.accepted_at or now
    elif new_status in (S.SERVED, S.COMPLETED):
        order.completed_at = order.completed_at or now
        order.ready_at = order.ready_at or now
    elif new_status == S.CANCELLED:
        order.cancelled_at = now
        order.cancel_reason = reason


def order_channels(order: Order) -> list[str | None]:
    return [
        realtime.staff_channel(order.restaurant_id),
        realtime.session_channel(order.session_id) if order.session_id else None,
        realtime.order_channel(order.id),
        realtime.reservation_channel(order.reservation_id) if order.reservation_id else None,
    ]


async def emit_order(order: Order, event: str = "order.updated") -> None:
    await realtime.emit(
        order_channels(order),
        event,
        {
            "order_id": order.id,
            "number": order.number,
            "status": order.status,
            "order_type": order.order_type,
            "table_label": order.table_label,
            "session_id": order.session_id,
        },
    )


async def load_order(db: AsyncSession, restaurant_id: str, order_id: str) -> Order:
    order = await db.scalar(select(Order).where(Order.id == order_id, Order.restaurant_id == restaurant_id))
    if not order:
        raise HTTPException(404, "Order not found")
    return order
