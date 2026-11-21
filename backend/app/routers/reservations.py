from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.deps import FloorStaff, Staff, StaffCtx
from app.models import DiningTable, Order, Reservation
from app.models.orders import OrderStatus
from app.models.reservations import ReservationStatus as RS
from app.schemas.orders import OrderOut
from app.schemas.reservations import ReservationDetailOut, ReservationIn, ReservationOut, ReservationUpdate, SeatIn
from app.services import realtime
from app.services.ordering import apply_transition, emit_order
from app.services.reservations import create_reservation, emit_preorder, emit_reservation, seat
from app.services.timeutil import local_date, tz

router = APIRouter(prefix="/reservations", tags=["reservations"])


async def _load(ctx: StaffCtx, reservation_id: str) -> Reservation:
    r = await ctx.db.get(Reservation, reservation_id)
    if not r or r.restaurant_id != ctx.restaurant.id:
        raise HTTPException(404, "Reservation not found")
    return r


async def detail(db, restaurant, r: Reservation) -> ReservationDetailOut:
    preorder = await db.get(Order, r.preorder_order_id) if r.preorder_order_id else None
    table = await db.get(DiningTable, r.table_id) if r.table_id else None
    address = ", ".join(p for p in [restaurant.address_line, restaurant.city] if p) or None
    return ReservationDetailOut(
        reservation=ReservationOut.model_validate(r),
        preorder=OrderOut.model_validate(preorder) if preorder else None,
        table_label=table.label if table else None,
        restaurant_name=restaurant.name,
        restaurant_slug=restaurant.slug,
        restaurant_address=address,
    )


@router.get("", response_model=list[ReservationDetailOut])
async def list_reservations(ctx: Staff, day: date | None = None):
    day = day or local_date(ctx.restaurant)
    zone = tz(ctx.restaurant)
    start = datetime.combine(day, time(0, 0), tzinfo=zone)
    rows = (await ctx.db.scalars(
        select(Reservation).where(
            Reservation.restaurant_id == ctx.restaurant.id,
            Reservation.reserved_for >= start,
            Reservation.reserved_for < start + timedelta(days=1),
        ).order_by(Reservation.reserved_for)
    )).all()
    return [await detail(ctx.db, ctx.restaurant, r) for r in rows]


@router.post("", response_model=ReservationDetailOut, status_code=201)
async def staff_create(data: ReservationIn, ctx: FloorStaff):
    """Phone bookings entered by staff."""
    r = await create_reservation(ctx.db, ctx.restaurant, data, source="phone")
    await ctx.db.commit()
    await emit_reservation(r, "reservation.created")
    return await detail(ctx.db, ctx.restaurant, r)


@router.patch("/{reservation_id}", response_model=ReservationDetailOut)
async def update_reservation(reservation_id: str, data: ReservationUpdate, ctx: FloorStaff):
    r = await _load(ctx, reservation_id)
    payload = data.model_dump(exclude_unset=True)
    new_status = payload.pop("status", None)
    if "table_id" in payload and payload["table_id"]:
        table = await ctx.db.get(DiningTable, payload["table_id"])
        if not table or table.restaurant_id != ctx.restaurant.id:
            raise HTTPException(404, "Table not found")
    for k, v in payload.items():
        setattr(r, k, v)
    cancelled_preorder = None
    if new_status and new_status != r.status:
        if r.status in (RS.COMPLETED, RS.CANCELLED, RS.NO_SHOW) and new_status not in (RS.PENDING, RS.CONFIRMED):
            raise HTTPException(409, f"Reservation is already {r.status}")
        r.status = new_status
        if new_status in (RS.CANCELLED, RS.NO_SHOW) and r.preorder_order_id:
            order = await ctx.db.get(Order, r.preorder_order_id)
            if order and order.status == OrderStatus.SCHEDULED:
                apply_transition(order, OrderStatus.CANCELLED, ctx.restaurant, reason=f"Reservation {new_status}")
                cancelled_preorder = order
    await ctx.db.commit()
    await emit_reservation(r)
    if cancelled_preorder:
        await emit_order(cancelled_preorder)
    return await detail(ctx.db, ctx.restaurant, r)


@router.post("/{reservation_id}/seat", response_model=ReservationDetailOut)
async def seat_reservation(reservation_id: str, data: SeatIn, ctx: FloorStaff):
    r = await _load(ctx, reservation_id)
    table = await ctx.db.get(DiningTable, data.table_id)
    if not table or table.restaurant_id != ctx.restaurant.id:
        raise HTTPException(404, "Table not found")
    session = await seat(ctx.db, ctx.restaurant, r, table)
    await ctx.db.commit()
    await emit_reservation(r)
    await emit_preorder(ctx.db, r)
    await realtime.emit([realtime.staff_channel(ctx.restaurant.id)], "session.updated", {"session_id": session.id})
    return await detail(ctx.db, ctx.restaurant, r)
