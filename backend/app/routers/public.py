"""Guest-facing API. No accounts: access is via signed guest tokens scoped to one session / order / reservation."""

import json
import secrets
from datetime import date, timedelta

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select

from app.db import utcnow
from app.deps import DB, Guest, GuestCtx
from app.models import Bill, DiningSession, DiningTable, Feedback, Order, Payment, Reservation, Restaurant, ServiceRequest
from app.models.billing import BillStatus, PaymentStatus
from app.models.orders import OrderStatus, OrderType
from app.models.reservations import ReservationStatus as RS
from app.models.tables import SessionStatus
from app.routers.reservations import detail as reservation_detail
from app.routers.tables import session_detail
from app.schemas.billing import (
    BillDetailOut,
    CheckoutOut,
    FeedbackIn,
    MockCompleteIn,
    PayIn,
    VerifyIn,
    WhatsAppIn,
    WhatsAppOut,
)
from app.schemas.menu import MenuOut
from app.schemas.orders import GuestOrderIn, OrderOut, PublicOrderIn
from app.schemas.reservations import ReservationCreatedOut, ReservationDetailOut, ReservationIn, SlotOut
from app.schemas.restaurant import RestaurantPublicOut
from app.schemas.tables import (
    GuestSessionOut,
    JoinSessionIn,
    ServiceRequestIn,
    ServiceRequestOut,
    SessionDetailOut,
    SessionOut,
    TableLookupOut,
)
from app.security import create_guest_token, decode_token
from app.services import realtime, whatsapp
from app.services.billing import (
    bill_lines,
    emit_bill,
    ensure_order_bill,
    ensure_session_bill,
    invoice_url,
    open_bill_for_session,
    recompute,
    record_success,
    start_online_payment,
    to_detail,
)
from app.services.invoice_pdf import render_invoice
from app.services.ordering import apply_transition, create_order, emit_order, find_by_client_id, settings_of
from app.services.payments import get_provider
from app.services.pricing import price_cart
from app.services.reservations import (
    available_slots,
    create_reservation,
    emit_preorder,
    emit_reservation,
    fire_preorder,
)
from app.services.restaurants import load_by_slug, menu_out, public_restaurant
from app.services.timeutil import is_open_now, opening_window, tz

router = APIRouter(prefix="/public", tags=["public"])


# ---- helpers ---------------------------------------------------------------------------------------------

async def _restaurant(db, rid: str) -> Restaurant:
    r = await db.get(Restaurant, rid)
    if not r:
        raise HTTPException(404, "Restaurant not found")
    return r


async def _guest_session(db, guest: GuestCtx, *, allow_closed: bool = False) -> DiningSession:
    if guest.scope != "session":
        raise HTTPException(403, "This link is not for a table")
    session = await db.get(DiningSession, guest.ref)
    if not session or session.restaurant_id != guest.restaurant_id:
        raise HTTPException(404, "Table session not found")
    if session.status == SessionStatus.CLOSED and not allow_closed:
        raise HTTPException(410, "This table session has ended. Scan the QR code to start a new one.")
    return session


async def _guest_bill(db, guest: GuestCtx, bill_id: str) -> Bill:
    bill = await db.get(Bill, bill_id)
    if not bill or bill.restaurant_id != guest.restaurant_id:
        raise HTTPException(404, "Bill not found")
    allowed = (guest.scope == "session" and bill.session_id == guest.ref) or (
        guest.scope == "order" and bill.order_id == guest.ref
    )
    if not allowed:
        raise HTTPException(403, "You can't access this bill")
    return bill


async def _guest_order(db, guest: GuestCtx) -> Order:
    if guest.scope != "order":
        raise HTTPException(403, "This link is not for an order")
    order = await db.get(Order, guest.ref)
    if not order or order.restaurant_id != guest.restaurant_id:
        raise HTTPException(404, "Order not found")
    return order


async def _guest_reservation(db, guest: GuestCtx) -> Reservation:
    if guest.scope != "reservation":
        raise HTTPException(403, "This link is not for a reservation")
    r = await db.get(Reservation, guest.ref)
    if not r or r.restaurant_id != guest.restaurant_id:
        raise HTTPException(404, "Reservation not found")
    return r


async def _emit_session(session: DiningSession) -> None:
    await realtime.emit(
        [realtime.staff_channel(session.restaurant_id), realtime.session_channel(session.id)],
        "session.updated",
        {"session_id": session.id, "status": session.status},
    )


def _table_info(t: DiningTable) -> dict:
    return {"id": t.id, "label": t.label, "area": t.area, "capacity": t.capacity}


# ---- storefront & menu -----------------------------------------------------------------------------------

@router.get("/restaurants/{slug}", response_model=RestaurantPublicOut)
async def storefront(slug: str, db: DB):
    return public_restaurant(await load_by_slug(db, slug))


@router.get("/restaurants/{slug}/menu", response_model=MenuOut)
async def public_menu(slug: str, db: DB, response: Response):
    r = await load_by_slug(db, slug)
    response.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=60"
    return await menu_out(db, r, public=True)


# ---- dine-in (QR) ----------------------------------------------------------------------------------------

async def _table_by_qr(db, qr: str) -> tuple[DiningTable, Restaurant]:
    table = await db.scalar(select(DiningTable).where(DiningTable.qr_token == qr))
    if not table or not table.is_active:
        raise HTTPException(404, "This QR code is not active. Please ask the staff for help.")
    return table, await _restaurant(db, table.restaurant_id)


async def _active_session(db, table_id: str) -> DiningSession | None:
    return await db.scalar(
        select(DiningSession).where(DiningSession.table_id == table_id, DiningSession.status.in_(SessionStatus.ACTIVE))
    )


@router.get("/qr/{qr}.png")
async def qr_image(qr: str, db: DB, base_url: str | None = None):
    """QR image for a table token. The token is already public (it is printed on the table)."""
    import io

    import qrcode

    from app.routers.tables import _base_url

    table, _ = await _table_by_qr(db, qr)
    img = qrcode.make(f"{_base_url(base_url)}/t/{table.qr_token}", box_size=12, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=300"})


@router.get("/tables/{qr}", response_model=TableLookupOut)
async def lookup_table(qr: str, db: DB):
    table, restaurant = await _table_by_qr(db, qr)
    session = await _active_session(db, table.id)
    active = None
    if session:
        orders = (await db.scalars(select(Order.id).where(Order.session_id == session.id))).all()
        active = {"id": session.id, "guest_count": session.guest_count, "opened_at": session.opened_at,
                  "orders_count": len(orders), "host": (session.guest_name or "").split(" ")[0] or None}
    return TableLookupOut(restaurant=public_restaurant(restaurant), table=_table_info(table), active_session=active)


@router.post("/tables/{qr}/session", response_model=GuestSessionOut)
async def join_table(qr: str, data: JoinSessionIn, db: DB):
    table, restaurant = await _table_by_qr(db, qr)
    if not settings_of(restaurant).dine_in_enabled:
        raise HTTPException(409, "Table ordering is switched off right now — please order with the staff")
    session = await _active_session(db, table.id)
    created = False
    if not session:
        session = DiningSession(restaurant_id=restaurant.id, table_id=table.id, guest_name=data.guest_name,
                                guest_count=data.guest_count or 1, opened_by="guest")
        db.add(session)
        created = True
    else:
        if data.guest_count and data.guest_count > session.guest_count:
            session.guest_count = data.guest_count
        if data.guest_name and not session.guest_name:
            session.guest_name = data.guest_name
    await db.commit()
    if created:
        await _emit_session(session)
    token = create_guest_token(restaurant.id, scope="session", ref_id=session.id, hours=12)
    return GuestSessionOut(token=token, session=SessionOut.model_validate(session), table=_table_info(table))


@router.get("/sessions/me", response_model=SessionDetailOut)
async def my_session(guest: Guest, db: DB):
    session = await _guest_session(db, guest, allow_closed=True)
    restaurant = await _restaurant(db, session.restaurant_id)
    return await session_detail(db, restaurant, session)


@router.post("/sessions/me/orders", response_model=OrderOut, status_code=201)
async def place_round(data: GuestOrderIn, guest: Guest, db: DB):
    session = await _guest_session(db, guest)
    restaurant = await _restaurant(db, session.restaurant_id)
    existing = await find_by_client_id(db, restaurant.id, data.client_order_id)
    if existing:
        return existing
    bill = await open_bill_for_session(db, session.id)
    if bill and bill.amount_paid > 0:
        raise HTTPException(409, "Payment has started for this table — please ask the staff to add items")
    table = await db.get(DiningTable, session.table_id)
    lines = await price_cart(db, restaurant.id, data.items)
    order = await create_order(
        db, restaurant, lines=lines, order_type=OrderType.DINE_IN, source="qr", session=session, table=table,
        customer_name=data.guest_name or session.guest_name, notes=data.notes, client_order_id=data.client_order_id,
    )
    if session.status == SessionStatus.BILL_REQUESTED:
        session.status = SessionStatus.OPEN
    if bill:
        bill.pay_preference = None
        bill.counter_requested_at = None
        await recompute(db, restaurant, bill)
    await db.commit()
    await emit_order(order, "order.created")
    await _emit_session(session)
    if bill:
        await emit_bill(bill)
    return order


@router.post("/sessions/me/requests", response_model=ServiceRequestOut, status_code=201)
async def call_staff(data: ServiceRequestIn, guest: Guest, db: DB):
    session = await _guest_session(db, guest)
    table = await db.get(DiningTable, session.table_id)
    recent = await db.scalar(
        select(ServiceRequest).where(
            ServiceRequest.session_id == session.id, ServiceRequest.kind == data.kind, ServiceRequest.status == "open"
        )
    )
    if recent:  # don't spam the floor with duplicate calls
        return ServiceRequestOut.model_validate(recent).model_copy(update={"table_label": table.label})
    req = ServiceRequest(restaurant_id=session.restaurant_id, table_id=session.table_id, session_id=session.id,
                         kind=data.kind, note=data.note)
    db.add(req)
    await db.commit()
    await realtime.emit(
        [realtime.staff_channel(session.restaurant_id), realtime.session_channel(session.id)],
        "service_request.created",
        {"request_id": req.id, "kind": req.kind, "table_label": table.label},
    )
    return ServiceRequestOut.model_validate(req).model_copy(update={"table_label": table.label})


@router.post("/sessions/me/bill", response_model=BillDetailOut)
async def request_bill(guest: Guest, db: DB):
    session = await _guest_session(db, guest)
    restaurant = await _restaurant(db, session.restaurant_id)
    table = await db.get(DiningTable, session.table_id)
    bill = await ensure_session_bill(db, restaurant, session, table.label)
    session.status = SessionStatus.BILL_REQUESTED
    await db.commit()
    await emit_bill(bill)
    await _emit_session(session)
    return await to_detail(db, bill)


# ---- takeaway / delivery ---------------------------------------------------------------------------------

class PublicOrderOut(BaseModel):
    token: str
    order: OrderOut
    bill: BillDetailOut
    checkout: CheckoutOut | None = None


@router.post("/restaurants/{slug}/orders", response_model=PublicOrderOut, status_code=201)
async def place_public_order(slug: str, data: PublicOrderIn, db: DB):
    restaurant = await load_by_slug(db, slug)
    s = settings_of(restaurant)
    existing = await find_by_client_id(db, restaurant.id, data.client_order_id)
    if existing:
        bill = await ensure_order_bill(db, restaurant, existing)
        await db.commit()
        return PublicOrderOut(token=create_guest_token(restaurant.id, scope="order", ref_id=existing.id, hours=72),
                              order=OrderOut.model_validate(existing), bill=await to_detail(db, bill))

    if data.order_type == OrderType.TAKEAWAY and not s.takeaway_enabled:
        raise HTTPException(409, "Takeaway is not available right now")
    if data.order_type == OrderType.DELIVERY:
        if not s.delivery_enabled:
            raise HTTPException(409, "Delivery is not available right now")
        if not data.delivery_address:
            raise HTTPException(422, "Please add a delivery address")
    if data.pay_mode == "online" and not s.online_payment_enabled:
        raise HTTPException(409, "Online payment is not available — choose pay at pickup")
    if data.pay_mode == "counter" and not s.pay_at_counter_enabled:
        raise HTTPException(409, "Please pay online for this order")

    scheduled = data.scheduled_for
    if scheduled:
        if not scheduled.tzinfo:
            scheduled = scheduled.replace(tzinfo=tz(restaurant))
        if scheduled < utcnow() + timedelta(minutes=10):
            scheduled = None  # effectively ASAP
        else:
            window = opening_window(restaurant, scheduled.astimezone(tz(restaurant)).date())
            prev = opening_window(restaurant, scheduled.astimezone(tz(restaurant)).date() - timedelta(days=1))
            if not any(w and w[0] <= scheduled < w[1] for w in (window, prev)):
                raise HTTPException(422, "The restaurant is closed at the selected time")
    if not scheduled and not is_open_now(restaurant):
        raise HTTPException(409, "The restaurant is closed right now — schedule your order for later")

    lines = await price_cart(db, restaurant.id, data.items)
    subtotal = sum(line.line_total for line in lines)
    if data.order_type == OrderType.DELIVERY and subtotal < s.min_delivery_order:
        raise HTTPException(422, f"Minimum order for delivery is ₹{s.min_delivery_order // 100}")

    status = OrderStatus.PENDING_PAYMENT if data.pay_mode == "online" else OrderStatus.PLACED
    order = await create_order(
        db, restaurant, lines=lines, order_type=data.order_type, source="web", status=status,
        customer_name=data.customer_name.strip(), customer_phone=data.customer_phone.strip(), notes=data.notes,
        delivery_address=data.delivery_address.model_dump() if data.delivery_address else None,
        scheduled_for=scheduled, client_order_id=data.client_order_id,
    )
    bill = await ensure_order_bill(db, restaurant, order)
    checkout = None
    if data.pay_mode == "online":
        payment = await start_online_payment(db, restaurant, bill)
        checkout = CheckoutOut(mode="online", bill=await to_detail(db, bill), payment_id=payment.id,
                               provider=payment.provider, provider_order_id=payment.provider_order_id,
                               key_id=payment.meta.get("key_id"), amount=payment.amount,
                               currency=restaurant.currency, restaurant_name=restaurant.name)
    else:
        bill.pay_preference = "counter"
    await db.commit()
    if status == OrderStatus.PLACED:
        await emit_order(order, "order.created")
        await emit_bill(bill)
    token = create_guest_token(restaurant.id, scope="order", ref_id=order.id, hours=72)
    return PublicOrderOut(token=token, order=OrderOut.model_validate(order), bill=await to_detail(db, bill),
                          checkout=checkout)


class TrackingOut(BaseModel):
    order: OrderOut
    bill: BillDetailOut | None
    restaurant: RestaurantPublicOut


@router.get("/orders/me", response_model=TrackingOut)
async def track_order(guest: Guest, db: DB):
    order = await _guest_order(db, guest)
    restaurant = await _restaurant(db, order.restaurant_id)
    bill = await db.scalar(select(Bill).where(Bill.order_id == order.id).order_by(Bill.created_at.desc()))
    return TrackingOut(order=OrderOut.model_validate(order), bill=await to_detail(db, bill) if bill else None,
                       restaurant=public_restaurant(restaurant))


# ---- payments --------------------------------------------------------------------------------------------

@router.post("/bills/{bill_id}/pay", response_model=CheckoutOut)
async def pay_bill(bill_id: str, data: PayIn, guest: Guest, db: DB):
    bill = await _guest_bill(db, guest, bill_id)
    if bill.status != BillStatus.OPEN:
        raise HTTPException(409, "This bill is already settled")
    restaurant = await _restaurant(db, bill.restaurant_id)
    s = settings_of(restaurant)
    await recompute(db, restaurant, bill)
    if data.customer_phone:
        bill.customer_phone = data.customer_phone
    if data.customer_name:
        bill.customer_name = data.customer_name

    if data.mode == "counter":
        if not s.pay_at_counter_enabled:
            raise HTTPException(409, "Please pay online")
        bill.pay_preference = "counter"
        bill.counter_requested_at = utcnow()
        session = await db.get(DiningSession, bill.session_id) if bill.session_id else None
        if session and session.status == SessionStatus.OPEN:
            session.status = SessionStatus.BILL_REQUESTED
        await db.commit()
        await emit_bill(bill)
        if session:
            await _emit_session(session)
        return CheckoutOut(mode="counter", bill=await to_detail(db, bill))

    if not s.online_payment_enabled:
        raise HTTPException(409, "Online payment is not available — please pay at the counter")
    payment = await start_online_payment(db, restaurant, bill)
    await db.commit()
    return CheckoutOut(mode="online", bill=await to_detail(db, bill), payment_id=payment.id,
                       provider=payment.provider, provider_order_id=payment.provider_order_id,
                       key_id=payment.meta.get("key_id"), amount=payment.amount, currency=restaurant.currency,
                       restaurant_name=restaurant.name)


async def _guest_payment(db, guest: GuestCtx, payment_id: str) -> tuple[Payment, Bill]:
    payment = await db.get(Payment, payment_id)
    if not payment or payment.restaurant_id != guest.restaurant_id:
        raise HTTPException(404, "Payment not found")
    bill = await _guest_bill(db, guest, payment.bill_id)
    return payment, bill


@router.post("/payments/{payment_id}/verify", response_model=BillDetailOut)
async def verify_payment(payment_id: str, data: VerifyIn, guest: Guest, db: DB):
    payment, bill = await _guest_payment(db, guest, payment_id)
    provider = get_provider()
    if payment.provider_order_id != data.razorpay_order_id or not provider.verify_payment_signature(
        data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature
    ):
        raise HTTPException(400, "Payment verification failed")
    restaurant = await _restaurant(db, bill.restaurant_id)
    await record_success(db, restaurant, bill, payment, provider_payment_id=data.razorpay_payment_id)
    await db.refresh(bill)
    return await to_detail(db, bill)


@router.post("/payments/{payment_id}/mock-complete", response_model=BillDetailOut)
async def mock_complete(payment_id: str, data: MockCompleteIn, guest: Guest, db: DB):
    payment, bill = await _guest_payment(db, guest, payment_id)
    if payment.provider != "mock":
        raise HTTPException(400, "Not a demo payment")
    restaurant = await _restaurant(db, bill.restaurant_id)
    if not data.success:
        payment.status = PaymentStatus.FAILED
        await db.commit()
        return await to_detail(db, bill)
    pay_id = f"mock_pay_{secrets.token_hex(6)}"
    await record_success(db, restaurant, bill, payment, provider_payment_id=pay_id, method=data.method)
    await db.refresh(bill)
    return await to_detail(db, bill)


@router.post("/payments/razorpay/webhook")
async def razorpay_webhook(request: Request, db: DB, x_razorpay_signature: str = Header("")):
    body = await request.body()
    provider = get_provider()
    if not provider.verify_webhook(body, x_razorpay_signature):
        raise HTTPException(400, "Invalid signature")
    event = json.loads(body)
    if event.get("event") not in ("payment.captured", "order.paid"):
        return {"ok": True, "ignored": event.get("event")}
    entity = event["payload"]["payment"]["entity"]
    payment = await db.scalar(select(Payment).where(Payment.provider_order_id == entity.get("order_id")))
    if not payment:
        return {"ok": True, "unknown_order": True}
    bill = await db.get(Bill, payment.bill_id)
    restaurant = await _restaurant(db, bill.restaurant_id)
    await record_success(db, restaurant, bill, payment, provider_payment_id=entity.get("id"),
                         method=entity.get("method"))
    return {"ok": True}


# ---- invoices & feedback ---------------------------------------------------------------------------------

@router.get("/bills/{bill_id}/invoice.pdf")
async def public_invoice(bill_id: str, db: DB, token: str = Query(...), download: bool = False):
    try:
        claims = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invoice link expired")
    if claims.get("typ") != "invoice" or claims.get("ref") != bill_id:
        raise HTTPException(403, "Invalid invoice link")
    bill = await db.get(Bill, bill_id)
    if not bill or bill.status != BillStatus.PAID:
        raise HTTPException(404, "Invoice not available")
    restaurant = await _restaurant(db, bill.restaurant_id)
    pdf = render_invoice(restaurant, bill, await bill_lines(db, bill))
    name = (bill.invoice_number or bill.id).replace("/", "-")
    disposition = "attachment" if download else "inline"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'{disposition}; filename="invoice-{name}.pdf"'})


@router.post("/bills/{bill_id}/whatsapp", response_model=WhatsAppOut)
async def guest_whatsapp(bill_id: str, data: WhatsAppIn, guest: Guest, db: DB):
    bill = await _guest_bill(db, guest, bill_id)
    if bill.status != BillStatus.PAID:
        raise HTTPException(409, "Your invoice will be ready once the bill is paid")
    restaurant = await _restaurant(db, bill.restaurant_id)
    pdf = render_invoice(restaurant, bill, await bill_lines(db, bill))
    result, share = await whatsapp.send_invoice(db, restaurant, bill, data.phone, pdf, invoice_url(bill))
    return WhatsAppOut(
        status=result.status, simulated=result.status == "simulated", share_url=share,
        message="Sent! Check your WhatsApp" if result.status == "sent" else
        ("Demo mode: WhatsApp message simulated" if result.status == "simulated" else
         "We couldn't send it on WhatsApp — use Share instead"),
    )


@router.post("/bills/{bill_id}/feedback", status_code=201)
async def leave_feedback(bill_id: str, data: FeedbackIn, guest: Guest, db: DB):
    bill = await _guest_bill(db, guest, bill_id)
    if await db.scalar(select(Feedback.id).where(Feedback.bill_id == bill.id)):
        raise HTTPException(409, "Thanks — feedback already received")
    db.add(Feedback(restaurant_id=bill.restaurant_id, bill_id=bill.id, rating=data.rating, comment=data.comment,
                    customer_name=bill.customer_name))
    await db.commit()
    await realtime.emit([realtime.staff_channel(bill.restaurant_id)], "feedback.created",
                        {"bill_id": bill.id, "rating": data.rating})
    return {"ok": True}


# ---- reservations ----------------------------------------------------------------------------------------

@router.get("/restaurants/{slug}/slots", response_model=list[SlotOut])
async def slots(slug: str, db: DB, day: date = Query(..., alias="date"), party_size: int = Query(2, ge=1, le=100)):
    restaurant = await load_by_slug(db, slug)
    if day > date.today() + timedelta(days=60):
        return []
    return await available_slots(db, restaurant, day, party_size)


@router.post("/restaurants/{slug}/reservations", response_model=ReservationCreatedOut, status_code=201)
async def book(slug: str, data: ReservationIn, db: DB):
    restaurant = await load_by_slug(db, slug)
    reservation = await create_reservation(db, restaurant, data)
    await db.commit()
    await emit_reservation(reservation, "reservation.created")
    if reservation.preorder_order_id:
        await emit_preorder(db, reservation)
    d = await reservation_detail(db, restaurant, reservation)
    token = create_guest_token(restaurant.id, scope="reservation", ref_id=reservation.id, hours=24 * 60)
    return ReservationCreatedOut(**d.model_dump(), token=token)


@router.get("/reservations/me", response_model=ReservationDetailOut)
async def my_reservation(guest: Guest, db: DB):
    r = await _guest_reservation(db, guest)
    return await reservation_detail(db, await _restaurant(db, r.restaurant_id), r)


@router.post("/reservations/me/on-my-way", response_model=ReservationDetailOut)
async def on_my_way(guest: Guest, db: DB):
    r = await _guest_reservation(db, guest)
    restaurant = await _restaurant(db, r.restaurant_id)
    if r.status not in (RS.CONFIRMED, RS.SEATED):
        raise HTTPException(409, "Your booking isn't confirmed yet — the restaurant will start cooking once it is")
    r.guest_on_way_at = r.guest_on_way_at or utcnow()
    fired = await fire_preorder(db, restaurant, r)
    await db.commit()
    await realtime.emit([realtime.staff_channel(r.restaurant_id), realtime.reservation_channel(r.id)],
                        "reservation.updated",
                        {"reservation_id": r.id, "status": r.status, "on_my_way": True, "name": r.customer_name,
                         "party_size": r.party_size, "fired": bool(fired)})
    if fired:
        await emit_order(fired, "order.created")
    return await reservation_detail(db, restaurant, r)


@router.post("/reservations/me/cancel", response_model=ReservationDetailOut)
async def cancel_reservation(guest: Guest, db: DB):
    r = await _guest_reservation(db, guest)
    restaurant = await _restaurant(db, r.restaurant_id)
    if r.status not in (RS.PENDING, RS.CONFIRMED):
        raise HTTPException(409, f"This booking is already {r.status.replace('_', ' ')}")
    r.status = RS.CANCELLED
    cancelled = None
    if r.preorder_order_id:
        order = await db.get(Order, r.preorder_order_id)
        if order and order.status == OrderStatus.SCHEDULED:
            apply_transition(order, OrderStatus.CANCELLED, restaurant, reason="Guest cancelled booking")
            cancelled = order
    await db.commit()
    await emit_reservation(r)
    if cancelled:
        await emit_order(cancelled)
    return await reservation_detail(db, restaurant, r)
