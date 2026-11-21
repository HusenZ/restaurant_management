from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import utcnow
from app.models import DiningSession, DiningTable, Order, Reservation, Restaurant
from app.models.orders import OrderStatus, OrderType
from app.models.reservations import ReservationStatus as RS
from app.models.tables import SessionStatus
from app.schemas.reservations import ReservationIn, SlotOut
from app.security import short_code
from app.services import realtime
from app.services.ordering import apply_transition, create_order, emit_order, settings_of
from app.services.pricing import price_cart
from app.services.timeutil import opening_window, tz


async def _active_tables(db: AsyncSession, restaurant_id: str) -> list[DiningTable]:
    return list(
        (
            await db.scalars(
                select(DiningTable)
                .where(DiningTable.restaurant_id == restaurant_id, DiningTable.is_active.is_(True))
                .order_by(DiningTable.capacity)
            )
        ).all()
    )


async def _reservations_between(
    db: AsyncSession, restaurant_id: str, start: datetime, end: datetime
) -> list[Reservation]:
    return list(
        (
            await db.scalars(
                select(Reservation).where(
                    Reservation.restaurant_id == restaurant_id,
                    Reservation.status.in_(RS.ACTIVE),
                    Reservation.reserved_for < end,
                    Reservation.reserved_for > start - timedelta(hours=8),
                )
            )
        ).all()
    )


def _fits(
    tables: list[DiningTable],
    existing: list[Reservation],
    slot_start: datetime,
    duration: int,
    party_size: int,
    exclude_id: str | None = None,
) -> bool:
    slot_end = slot_start + timedelta(minutes=duration)
    overlapping = [
        r for r in existing
        if r.id != exclude_id
        and r.reserved_for < slot_end
        and r.reserved_for + timedelta(minutes=r.duration_minutes) > slot_start
    ]
    pool = list(tables)  # sorted by capacity ascending
    for r in overlapping:
        if r.table_id:
            pool = [t for t in pool if t.id != r.table_id]
    for r in sorted((r for r in overlapping if not r.table_id), key=lambda r: -r.party_size):
        match = next((t for t in pool if t.capacity >= r.party_size), None)
        if match:
            pool.remove(match)
    return any(t.capacity >= party_size for t in pool)


async def available_slots(db: AsyncSession, restaurant: Restaurant, day: date, party_size: int) -> list[SlotOut]:
    s = settings_of(restaurant)
    window = opening_window(restaurant, day)
    if not window or party_size > s.max_party_size:
        return []
    opens, closes = window
    tables = await _active_tables(db, restaurant.id)
    existing = await _reservations_between(db, restaurant.id, opens, closes)
    now = utcnow() + timedelta(minutes=30)  # need a little lead time
    slots: list[SlotOut] = []
    cursor = opens
    last_start = closes - timedelta(minutes=min(s.reservation_duration_minutes, 60))
    while cursor <= last_start:
        ok = cursor > now and _fits(tables, existing, cursor, s.reservation_duration_minutes, party_size)
        slots.append(SlotOut(time=cursor, label=cursor.strftime("%I:%M %p").lstrip("0"), available=ok))
        cursor += timedelta(minutes=s.reservation_slot_minutes)
    return slots


async def create_reservation(
    db: AsyncSession, restaurant: Restaurant, data: ReservationIn, source: str = "web"
) -> Reservation:
    s = settings_of(restaurant)
    if not s.reservations_enabled:
        raise HTTPException(409, "This restaurant is not taking reservations right now")
    if data.party_size > s.max_party_size:
        raise HTTPException(422, f"For groups larger than {s.max_party_size}, please call the restaurant")
    start = data.reserved_for if data.reserved_for.tzinfo else data.reserved_for.replace(tzinfo=tz(restaurant))
    if start < utcnow():
        raise HTTPException(422, "Please choose a time in the future")
    window = opening_window(restaurant, start.astimezone(tz(restaurant)).date())
    if not window or not (window[0] <= start < window[1]):
        raise HTTPException(422, "The restaurant is closed at that time")
    tables = await _active_tables(db, restaurant.id)
    existing = await _reservations_between(db, restaurant.id, start - timedelta(hours=8), start + timedelta(hours=8))
    if not _fits(tables, existing, start, s.reservation_duration_minutes, data.party_size):
        raise HTTPException(409, "That slot just filled up — please pick another time")

    reservation = Reservation(
        restaurant_id=restaurant.id,
        code=short_code(6),
        customer_name=data.customer_name.strip(),
        customer_phone=data.customer_phone.strip(),
        customer_email=data.customer_email,
        party_size=data.party_size,
        reserved_for=start,
        duration_minutes=s.reservation_duration_minutes,
        status=RS.CONFIRMED if s.auto_confirm_reservations else RS.PENDING,
        occasion=data.occasion,
        notes=data.notes,
        source=source,
    )
    db.add(reservation)
    await db.flush()

    if data.preorder_items:
        if not s.preorder_enabled:
            raise HTTPException(409, "Pre-ordering is not available at this restaurant")
        lines = await price_cart(db, restaurant.id, data.preorder_items)
        longest = max((line.prep_minutes for line in lines), default=s.avg_prep_minutes)
        fire_at = start - timedelta(minutes=max(longest, s.preorder_fire_minutes_before))
        order = await create_order(
            db,
            restaurant,
            lines=lines,
            order_type=OrderType.DINE_IN,
            source="reservation",
            status=OrderStatus.SCHEDULED,
            customer_name=reservation.customer_name,
            customer_phone=reservation.customer_phone,
            notes=data.preorder_notes,
            scheduled_for=max(fire_at, utcnow()),
            reservation_id=reservation.id,
        )
        reservation.preorder_order_id = order.id
    return reservation


async def fire_preorder(db: AsyncSession, restaurant: Restaurant, reservation: Reservation) -> Order | None:
    if not reservation.preorder_order_id:
        return None
    order = await db.get(Order, reservation.preorder_order_id)
    if not order or order.status != OrderStatus.SCHEDULED:
        return None
    apply_transition(order, OrderStatus.PLACED, restaurant)
    return order


async def table_has_active_session(db: AsyncSession, table_id: str) -> DiningSession | None:
    return await db.scalar(
        select(DiningSession).where(DiningSession.table_id == table_id, DiningSession.status.in_(SessionStatus.ACTIVE))
    )


async def seat(db: AsyncSession, restaurant: Restaurant, reservation: Reservation, table: DiningTable) -> DiningSession:
    if reservation.status not in (RS.PENDING, RS.CONFIRMED):
        raise HTTPException(409, f"Reservation is {reservation.status}")
    if await table_has_active_session(db, table.id):
        raise HTTPException(409, f"Table {table.label} is occupied")
    session = DiningSession(
        restaurant_id=restaurant.id,
        table_id=table.id,
        reservation_id=reservation.id,
        guest_name=reservation.customer_name,
        guest_count=reservation.party_size,
        customer_phone=reservation.customer_phone,
        opened_by="reservation",
    )
    db.add(session)
    await db.flush()
    reservation.status = RS.SEATED
    reservation.table_id = table.id
    reservation.session_id = session.id

    if reservation.preorder_order_id:
        order = await db.get(Order, reservation.preorder_order_id)
        if order and order.status != OrderStatus.CANCELLED:
            order.session_id = session.id
            order.table_id = table.id
            order.table_label = table.label
            if order.status == OrderStatus.SCHEDULED:
                apply_transition(order, OrderStatus.PLACED, restaurant)
    return session


async def emit_reservation(reservation: Reservation, event: str = "reservation.updated") -> None:
    await realtime.emit(
        [realtime.staff_channel(reservation.restaurant_id), realtime.reservation_channel(reservation.id)],
        event,
        {"reservation_id": reservation.id, "status": reservation.status, "code": reservation.code},
    )


async def emit_preorder(db: AsyncSession, reservation: Reservation) -> None:
    if reservation.preorder_order_id:
        order = await db.get(Order, reservation.preorder_order_id)
        if order:
            await emit_order(order, "order.created" if order.status in OrderStatus.KITCHEN_ACTIVE else "order.updated")
