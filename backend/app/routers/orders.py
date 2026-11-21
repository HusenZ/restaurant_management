from datetime import timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import or_, select

from app.db import utcnow
from app.deps import FloorStaff, KitchenStaff, Staff
from app.models import DiningSession, DiningTable, Order
from app.models.orders import OrderStatus, OrderType
from app.models.tables import SessionStatus
from app.schemas.orders import ItemDoneIn, OrderOut, StaffOrderIn, StatusUpdateIn
from app.services import realtime
from app.services.billing import emit_bill, ensure_order_bill, open_bill_for_session, recompute
from app.services.ordering import apply_transition, create_order, emit_order, find_by_client_id, load_order
from app.services.pricing import price_cart
from app.services.reservations import table_has_active_session

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderOut])
async def list_orders(
    ctx: Staff,
    status: list[str] | None = Query(None),
    order_type: str | None = None,
    active: bool = False,
    hours: int = 24,
    limit: int = 200,
):
    stmt = select(Order).where(Order.restaurant_id == ctx.restaurant.id)
    if active:
        stmt = stmt.where(
            or_(
                Order.status.in_(OrderStatus.KITCHEN_ACTIVE),
                Order.status == OrderStatus.OUT_FOR_DELIVERY,
                Order.status == OrderStatus.SCHEDULED,
            )
        )
    else:
        stmt = stmt.where(Order.created_at >= utcnow() - timedelta(hours=min(hours, 24 * 31)))
    if status:
        stmt = stmt.where(Order.status.in_(status))
    if order_type:
        stmt = stmt.where(Order.order_type == order_type)
    rows = (await ctx.db.scalars(stmt.order_by(Order.created_at.desc()).limit(min(limit, 500)))).all()
    return rows


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(order_id: str, ctx: Staff):
    return await load_order(ctx.db, ctx.restaurant.id, order_id)


@router.post("", response_model=OrderOut, status_code=201)
async def staff_order(data: StaffOrderIn, ctx: FloorStaff):
    """Waiter-assisted ordering (guest without a phone) or counter takeaway."""
    existing = await find_by_client_id(ctx.db, ctx.restaurant.id, data.client_order_id)
    if existing:
        return existing
    lines = await price_cart(ctx.db, ctx.restaurant.id, data.items)
    session = table = None
    if data.order_type == OrderType.DINE_IN:
        if not data.table_id:
            raise HTTPException(422, "Choose a table for dine-in orders")
        table = await ctx.db.get(DiningTable, data.table_id)
        if not table or table.restaurant_id != ctx.restaurant.id:
            raise HTTPException(404, "Table not found")
        session = await table_has_active_session(ctx.db, table.id)
        if not session:
            session = DiningSession(restaurant_id=ctx.restaurant.id, table_id=table.id, opened_by="staff",
                                    guest_name=data.customer_name)
            ctx.db.add(session)
            await ctx.db.flush()
        elif session.status == SessionStatus.BILL_REQUESTED:
            session.status = SessionStatus.OPEN
    order = await create_order(
        ctx.db, ctx.restaurant, lines=lines, order_type=data.order_type, source="staff",
        session=session, table=table, customer_name=data.customer_name, customer_phone=data.customer_phone,
        notes=data.notes, client_order_id=data.client_order_id,
    )
    bill = None
    if session:
        bill = await open_bill_for_session(ctx.db, session.id)
        if bill:
            await recompute(ctx.db, ctx.restaurant, bill)
    else:
        bill = await ensure_order_bill(ctx.db, ctx.restaurant, order)
    await ctx.db.commit()
    await emit_order(order, "order.created")
    if bill:
        await emit_bill(bill)
    if session:
        await realtime.emit([realtime.staff_channel(ctx.restaurant.id), realtime.session_channel(session.id)],
                            "session.updated", {"session_id": session.id})
    return order


@router.patch("/{order_id}/status", response_model=OrderOut)
async def update_status(order_id: str, data: StatusUpdateIn, ctx: KitchenStaff):
    order = await load_order(ctx.db, ctx.restaurant.id, order_id)
    apply_transition(order, data.status, ctx.restaurant, data.reason)
    bill = None
    if order.status == OrderStatus.CANCELLED:
        # a cancelled round must disappear from the table bill
        if order.session_id:
            bill = await open_bill_for_session(ctx.db, order.session_id)
            if bill:
                await recompute(ctx.db, ctx.restaurant, bill)
    await ctx.db.commit()
    await emit_order(order)
    if bill:
        await emit_bill(bill)
    return order


@router.patch("/{order_id}/items/{item_id}", response_model=OrderOut)
async def mark_item(order_id: str, item_id: str, data: ItemDoneIn, ctx: KitchenStaff):
    order = await load_order(ctx.db, ctx.restaurant.id, order_id)
    item = next((i for i in order.items if i.id == item_id), None)
    if not item:
        raise HTTPException(404, "Item not found on this order")
    item.is_done = data.is_done
    await ctx.db.commit()
    await realtime.emit([realtime.staff_channel(ctx.restaurant.id)], "order.updated",
                        {"order_id": order.id, "status": order.status})
    return order


@router.post("/{order_id}/fire", response_model=OrderOut)
async def fire_now(order_id: str, ctx: KitchenStaff):
    order = await load_order(ctx.db, ctx.restaurant.id, order_id)
    if order.status != OrderStatus.SCHEDULED:
        raise HTTPException(409, "Only scheduled pre-orders can be fired")
    apply_transition(order, OrderStatus.PLACED, ctx.restaurant)
    await ctx.db.commit()
    await emit_order(order, "order.created")
    return order

