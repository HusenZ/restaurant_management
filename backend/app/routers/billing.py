from datetime import timedelta

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select

from app.db import utcnow
from app.deps import Cashier, Staff
from app.models import Bill
from app.models.billing import BillStatus
from app.schemas.billing import BillDetailOut, BillOut, CollectIn, DiscountIn, WhatsAppIn, WhatsAppOut
from app.services import whatsapp
from app.services.billing import (
    bill_lines,
    collect_at_counter,
    emit_bill,
    invoice_url,
    load_bill,
    recompute,
    to_detail,
)
from app.services.invoice_pdf import render_invoice

router = APIRouter(prefix="/bills", tags=["billing"])


@router.get("", response_model=list[BillOut])
async def list_bills(
    ctx: Staff,
    status: str | None = Query(None, pattern=r"^(open|paid|void)$"),
    counter: bool = False,
    days: int = 1,
    limit: int = 200,
):
    stmt = select(Bill).where(Bill.restaurant_id == ctx.restaurant.id)
    if status:
        stmt = stmt.where(Bill.status == status)
    if counter:
        stmt = stmt.where(Bill.status == BillStatus.OPEN, Bill.pay_preference == "counter")
    if status != BillStatus.OPEN and not counter:
        stmt = stmt.where(Bill.created_at >= utcnow() - timedelta(days=min(days, 90)))
    rows = (await ctx.db.scalars(stmt.order_by(Bill.created_at.desc()).limit(min(limit, 500)))).all()
    return rows


@router.get("/{bill_id}", response_model=BillDetailOut)
async def get_bill(bill_id: str, ctx: Staff):
    bill = await load_bill(ctx.db, ctx.restaurant.id, bill_id)
    return await to_detail(ctx.db, bill)


@router.post("/{bill_id}/discount", response_model=BillDetailOut)
async def apply_discount(bill_id: str, data: DiscountIn, ctx: Cashier):
    bill = await load_bill(ctx.db, ctx.restaurant.id, bill_id)
    if bill.status != BillStatus.OPEN:
        raise HTTPException(409, "Discounts can only be applied to open bills")
    if data.kind == "percent":
        if data.value > 100:
            raise HTTPException(422, "Percent discount must be 0–100")
        bill.discount_percent = data.value or None
        bill.discount = round(bill.subtotal * data.value / 100)
        label = f"{data.value:g}%"
    else:
        bill.discount_percent = None
        bill.discount = int(data.value)
        label = None
    bill.discount_reason = (data.reason or label) if bill.discount else None
    await recompute(ctx.db, ctx.restaurant, bill)
    await ctx.db.commit()
    await emit_bill(bill)
    return await to_detail(ctx.db, bill)


@router.post("/{bill_id}/collect", response_model=BillDetailOut)
async def collect(bill_id: str, data: CollectIn, ctx: Cashier):
    bill = await load_bill(ctx.db, ctx.restaurant.id, bill_id)
    if data.customer_phone and not bill.customer_phone:
        bill.customer_phone = data.customer_phone
    await collect_at_counter(ctx.db, ctx.restaurant, bill, method=data.method, tendered=data.tendered,
                             collected_by=ctx.user.id)
    await ctx.db.refresh(bill)
    return await to_detail(ctx.db, bill)


@router.get("/{bill_id}/invoice.pdf")
async def invoice_pdf(bill_id: str, ctx: Staff):
    bill = await load_bill(ctx.db, ctx.restaurant.id, bill_id)
    pdf = render_invoice(ctx.restaurant, bill, await bill_lines(ctx.db, bill))
    name = (bill.invoice_number or f"draft-{bill.id[:6]}").replace("/", "-")
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{name}.pdf"'})


@router.post("/{bill_id}/whatsapp", response_model=WhatsAppOut)
async def send_whatsapp(bill_id: str, data: WhatsAppIn, ctx: Cashier):
    bill = await load_bill(ctx.db, ctx.restaurant.id, bill_id)
    if bill.status != BillStatus.PAID:
        raise HTTPException(409, "Invoices are sent once the bill is paid")
    pdf = render_invoice(ctx.restaurant, bill, await bill_lines(ctx.db, bill))
    result, share = await whatsapp.send_invoice(ctx.db, ctx.restaurant, bill, data.phone, pdf, invoice_url(bill))
    return WhatsAppOut(
        status=result.status, simulated=result.status == "simulated", share_url=share,
        message="Invoice sent on WhatsApp" if result.status == "sent" else
        ("WhatsApp is in demo mode — message logged" if result.status == "simulated" else "Could not send on WhatsApp"),
    )
