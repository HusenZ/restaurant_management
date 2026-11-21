import io
from datetime import timedelta

import qrcode
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select

from app.config import settings
from app.db import utcnow
from app.deps import FloorStaff, Manager, Staff, StaffCtx
from app.models import Bill, DiningSession, DiningTable, Order, Reservation, ServiceRequest
from app.models.billing import BillStatus
from app.models.orders import OrderStatus
from app.models.reservations import ReservationStatus
from app.models.tables import SessionStatus
from app.schemas.billing import BillDetailOut
from app.schemas.orders import OrderOut
from app.schemas.tables import (
    LiveTableOut,
    OpenSessionIn,
    ServiceRequestOut,
    SessionDetailOut,
    SessionOut,
    TableBulkIn,
    TableIn,
    TableOut,
    TableUpdate,
)
from app.services import realtime
from app.services.billing import emit_bill, ensure_session_bill, latest_bill_for_session, to_detail
from app.services.invoice_pdf import render_qr_sheet
from app.services.reservations import table_has_active_session
from app.services.restaurants import new_qr_token

router = APIRouter(tags=["tables"])


def _base_url(base_url: str | None) -> str:
    if base_url and base_url.startswith(("http://", "https://")) and len(base_url) < 200:
        return base_url.rstrip("/")
    return settings.public_app_url


async def _table(ctx: StaffCtx, table_id: str) -> DiningTable:
    t = await ctx.db.get(DiningTable, table_id)
    if not t or t.restaurant_id != ctx.restaurant.id:
        raise HTTPException(404, "Table not found")
    return t


async def _session(ctx: StaffCtx, session_id: str) -> DiningSession:
    s = await ctx.db.get(DiningSession, session_id)
    if not s or s.restaurant_id != ctx.restaurant.id:
        raise HTTPException(404, "Session not found")
    return s


async def _emit_table(restaurant_id: str, session_id: str | None = None) -> None:
    await realtime.emit(
        [realtime.staff_channel(restaurant_id), realtime.session_channel(session_id) if session_id else None],
        "session.updated",
        {"session_id": session_id},
    )


# ---- tables CRUD -----------------------------------------------------------------------------------------

@router.get("/tables", response_model=list[TableOut])
async def list_tables(ctx: Staff):
    return (await ctx.db.scalars(
        select(DiningTable).where(DiningTable.restaurant_id == ctx.restaurant.id)
        .order_by(DiningTable.area, DiningTable.sort_order, DiningTable.label)
    )).all()


@router.post("/tables", response_model=TableOut, status_code=201)
async def create_table(data: TableIn, ctx: Manager):
    order = data.sort_order
    if order is None:
        order = (await ctx.db.scalar(
            select(func.max(DiningTable.sort_order)).where(DiningTable.restaurant_id == ctx.restaurant.id)
        ) or 0) + 1
    t = DiningTable(restaurant_id=ctx.restaurant.id, label=data.label, area=data.area, capacity=data.capacity,
                    is_active=data.is_active, sort_order=order, qr_token=new_qr_token())
    ctx.db.add(t)
    await ctx.db.commit()
    await _emit_table(ctx.restaurant.id)
    return t


@router.post("/tables/bulk", response_model=list[TableOut], status_code=201)
async def bulk_create(data: TableBulkIn, ctx: Manager):
    start_order = (await ctx.db.scalar(
        select(func.max(DiningTable.sort_order)).where(DiningTable.restaurant_id == ctx.restaurant.id)
    ) or 0) + 1
    tables = [
        DiningTable(restaurant_id=ctx.restaurant.id, label=f"{data.prefix}{data.start + i}", area=data.area,
                    capacity=data.capacity, sort_order=start_order + i, qr_token=new_qr_token())
        for i in range(data.count)
    ]
    ctx.db.add_all(tables)
    await ctx.db.commit()
    await _emit_table(ctx.restaurant.id)
    return tables


@router.patch("/tables/{table_id}", response_model=TableOut)
async def update_table(table_id: str, data: TableUpdate, ctx: Manager):
    t = await _table(ctx, table_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    await ctx.db.commit()
    await _emit_table(ctx.restaurant.id)
    return t


@router.delete("/tables/{table_id}", status_code=204)
async def delete_table(table_id: str, ctx: Manager):
    t = await _table(ctx, table_id)
    if await table_has_active_session(ctx.db, t.id):
        raise HTTPException(409, "Close the running session before deleting this table")
    await ctx.db.delete(t)
    await ctx.db.commit()
    await _emit_table(ctx.restaurant.id)


@router.post("/tables/{table_id}/rotate-qr", response_model=TableOut)
async def rotate_qr(table_id: str, ctx: Manager):
    t = await _table(ctx, table_id)
    t.qr_token = new_qr_token()
    await ctx.db.commit()
    return t


@router.get("/tables/{table_id}/qr.png")
async def table_qr(table_id: str, ctx: Staff, base_url: str | None = None):
    t = await _table(ctx, table_id)
    img = qrcode.make(f"{_base_url(base_url)}/t/{t.qr_token}", box_size=12, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png",
                    headers={"Content-Disposition": f'inline; filename="table-{t.label}.png"'})


@router.get("/tables-qr-sheet.pdf")
async def qr_sheet(ctx: Staff, base_url: str | None = None):
    tables = (await ctx.db.scalars(
        select(DiningTable).where(DiningTable.restaurant_id == ctx.restaurant.id, DiningTable.is_active.is_(True))
        .order_by(DiningTable.area, DiningTable.sort_order)
    )).all()
    pdf = render_qr_sheet(ctx.restaurant, list(tables), _base_url(base_url))
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="table-qr-codes.pdf"'})


# ---- live floor ------------------------------------------------------------------------------------------

@router.get("/tables/live", response_model=list[LiveTableOut])
async def live_tables(ctx: Staff):
    rid = ctx.restaurant.id
    tables = (await ctx.db.scalars(
        select(DiningTable).where(DiningTable.restaurant_id == rid, DiningTable.is_active.is_(True))
        .order_by(DiningTable.area, DiningTable.sort_order, DiningTable.label)
    )).all()
    sessions = (await ctx.db.scalars(
        select(DiningSession).where(DiningSession.restaurant_id == rid, DiningSession.status.in_(SessionStatus.ACTIVE))
    )).all()
    by_table = {s.table_id: s for s in sessions}
    session_ids = [s.id for s in sessions]
    orders = (await ctx.db.scalars(select(Order).where(Order.session_id.in_(session_ids)))).all() if session_ids else []
    bills = (await ctx.db.scalars(
        select(Bill).where(Bill.session_id.in_(session_ids), Bill.status == BillStatus.OPEN)
    )).all() if session_ids else []
    bill_by_session = {b.session_id: b for b in bills}
    requests = (await ctx.db.scalars(
        select(ServiceRequest).where(ServiceRequest.restaurant_id == rid, ServiceRequest.status == "open")
        .order_by(ServiceRequest.created_at)
    )).all()
    now = utcnow()
    upcoming = (await ctx.db.scalars(
        select(Reservation).where(
            Reservation.restaurant_id == rid,
            Reservation.status.in_([ReservationStatus.CONFIRMED, ReservationStatus.PENDING]),
            Reservation.table_id.is_not(None),
            Reservation.reserved_for.between(now - timedelta(minutes=30), now + timedelta(hours=2)),
        )
    )).all()
    upcoming_by_table = {r.table_id: r for r in upcoming}

    out: list[LiveTableOut] = []
    for t in tables:
        s = by_table.get(t.id)
        t_orders = [o for o in orders if s and o.session_id == s.id and o.status != OrderStatus.CANCELLED]
        t_requests = [r for r in requests if r.table_id == t.id]
        bill = bill_by_session.get(s.id) if s else None
        if not s:
            state = "free"
        elif t_requests:
            state = "attention"
        elif bill and bill.pay_preference == "counter":
            state = "awaiting_counter"
        elif s.status == SessionStatus.BILL_REQUESTED:
            state = "bill_requested"
        else:
            state = "occupied"
        r = upcoming_by_table.get(t.id)
        out.append(LiveTableOut(
            table=TableOut.model_validate(t),
            state=state,
            session=SessionOut.model_validate(s) if s else None,
            orders_count=len(t_orders),
            active_orders=sum(1 for o in t_orders if o.status in (OrderStatus.PLACED, OrderStatus.PREPARING)),
            running_total=bill.total if bill else sum(o.subtotal for o in t_orders),
            open_requests=[ServiceRequestOut.model_validate(x).model_copy(update={"table_label": t.label})
                           for x in t_requests],
            bill_id=bill.id if bill else None,
            upcoming_reservation={"id": r.id, "name": r.customer_name, "party_size": r.party_size,
                                  "reserved_for": r.reserved_for.isoformat()} if r else None,
        ))
    return out


# ---- sessions --------------------------------------------------------------------------------------------

@router.post("/sessions", response_model=SessionOut, status_code=201)
async def open_session(data: OpenSessionIn, ctx: FloorStaff):
    table = await _table(ctx, data.table_id)
    if await table_has_active_session(ctx.db, table.id):
        raise HTTPException(409, f"Table {table.label} already has guests")
    s = DiningSession(restaurant_id=ctx.restaurant.id, table_id=table.id, guest_count=data.guest_count,
                      guest_name=data.guest_name, customer_phone=data.customer_phone, opened_by="staff")
    ctx.db.add(s)
    await ctx.db.commit()
    await _emit_table(ctx.restaurant.id, s.id)
    return s


async def session_detail(ctx_db, restaurant, session: DiningSession) -> SessionDetailOut:
    table = await ctx_db.get(DiningTable, session.table_id)
    orders = (await ctx_db.scalars(
        select(Order).where(Order.session_id == session.id).order_by(Order.created_at)
    )).all()
    bill = await latest_bill_for_session(ctx_db, session.id)
    requests = (await ctx_db.scalars(
        select(ServiceRequest).where(ServiceRequest.session_id == session.id).order_by(ServiceRequest.created_at.desc())
    )).all()
    bill_out: BillDetailOut | None = await to_detail(ctx_db, bill) if bill else None
    running = bill.total if bill else sum(o.subtotal for o in orders if o.status != OrderStatus.CANCELLED)
    return SessionDetailOut(
        session=SessionOut.model_validate(session),
        table=TableOut.model_validate(table),
        orders=[OrderOut.model_validate(o) for o in orders],
        bill=bill_out,
        running_total=running,
        requests=[ServiceRequestOut.model_validate(r).model_copy(update={"table_label": table.label}) for r in requests],
    )


@router.get("/sessions/{session_id}", response_model=SessionDetailOut)
async def get_session(session_id: str, ctx: Staff):
    s = await _session(ctx, session_id)
    return await session_detail(ctx.db, ctx.restaurant, s)


@router.post("/sessions/{session_id}/bill", response_model=BillDetailOut)
async def generate_bill(session_id: str, ctx: FloorStaff):
    s = await _session(ctx, session_id)
    if s.status == SessionStatus.CLOSED:
        raise HTTPException(409, "Session is closed")
    table = await ctx.db.get(DiningTable, s.table_id)
    bill = await ensure_session_bill(ctx.db, ctx.restaurant, s, table.label)
    s.status = SessionStatus.BILL_REQUESTED
    await ctx.db.commit()
    await emit_bill(bill)
    await _emit_table(ctx.restaurant.id, s.id)
    return await to_detail(ctx.db, bill)


@router.post("/sessions/{session_id}/close", response_model=SessionOut)
async def close_session(session_id: str, ctx: FloorStaff):
    s = await _session(ctx, session_id)
    if s.status == SessionStatus.CLOSED:
        return s
    bill = await latest_bill_for_session(ctx.db, s.id)
    if bill and bill.status == BillStatus.OPEN:
        if bill.amount_paid > 0:
            raise HTTPException(409, "This bill is partly paid — collect the balance first")
        active = await ctx.db.scalar(
            select(func.count(Order.id)).where(Order.session_id == s.id, Order.status != OrderStatus.CANCELLED)
        )
        if active and bill.total > 0:
            raise HTTPException(409, "Settle the bill before closing the table")
        bill.status = BillStatus.VOID
    else:
        active = await ctx.db.scalar(
            select(func.count(Order.id)).where(Order.session_id == s.id, Order.status != OrderStatus.CANCELLED)
        )
        if active and not bill:
            raise HTTPException(409, "This table has orders — generate and settle the bill first")
    s.status = SessionStatus.CLOSED
    s.closed_at = utcnow()
    for req in (await ctx.db.scalars(
        select(ServiceRequest).where(ServiceRequest.session_id == s.id, ServiceRequest.status == "open")
    )).all():
        req.status = "resolved"
        req.resolved_at = utcnow()
    await ctx.db.commit()
    await _emit_table(ctx.restaurant.id, s.id)
    return s


# ---- service requests ------------------------------------------------------------------------------------

@router.get("/service-requests", response_model=list[ServiceRequestOut])
async def list_requests(ctx: Staff, status: str = Query("open")):
    rows = (await ctx.db.execute(
        select(ServiceRequest, DiningTable.label)
        .join(DiningTable, DiningTable.id == ServiceRequest.table_id)
        .where(ServiceRequest.restaurant_id == ctx.restaurant.id, ServiceRequest.status == status)
        .order_by(ServiceRequest.created_at.desc()).limit(100)
    )).all()
    return [ServiceRequestOut.model_validate(req).model_copy(update={"table_label": label}) for req, label in rows]


@router.post("/service-requests/{request_id}/resolve", response_model=ServiceRequestOut)
async def resolve_request(request_id: str, ctx: Staff):
    req = await ctx.db.get(ServiceRequest, request_id)
    if not req or req.restaurant_id != ctx.restaurant.id:
        raise HTTPException(404, "Request not found")
    req.status = "resolved"
    req.resolved_at = utcnow()
    req.resolved_by = ctx.user.id
    await ctx.db.commit()
    await realtime.emit(
        [realtime.staff_channel(ctx.restaurant.id), realtime.session_channel(req.session_id) if req.session_id else None],
        "service_request.resolved", {"request_id": req.id, "kind": req.kind},
    )
    return ServiceRequestOut.model_validate(req)
