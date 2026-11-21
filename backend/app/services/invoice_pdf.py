"""PDF rendering: GST tax invoice (A5) and printable QR table tents (A4, 4 per page)."""

import io
from datetime import datetime

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models import Bill, DiningTable, Restaurant
from app.schemas.billing import BillLineOut
from app.schemas.restaurant import RestaurantSettings
from app.services.timeutil import tz


def format_inr(paise: int, with_symbol: bool = False) -> str:
    """Indian digit grouping: 1234567.5 -> 12,34,567.50"""
    negative = paise < 0
    rupees, fraction = divmod(abs(paise), 100)
    s = str(rupees)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    out = f"{s}.{fraction:02d}"
    if with_symbol:
        out = f"Rs. {out}"
    return f"-{out}" if negative else out


def _brand(restaurant: Restaurant) -> colors.Color:
    try:
        return colors.HexColor(RestaurantSettings.model_validate(restaurant.settings or {}).theme_color)
    except Exception:
        return colors.HexColor("#E8590C")


def _styles(brand: colors.Color) -> dict[str, ParagraphStyle]:
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=8.5, leading=11, textColor=colors.HexColor("#27272a"))
    return {
        "base": base,
        "muted": ParagraphStyle("muted", parent=base, fontSize=7.5, leading=10, textColor=colors.HexColor("#71717a")),
        "name": ParagraphStyle("name", parent=base, fontName="Helvetica-Bold", fontSize=16, leading=19, textColor=brand),
        "title": ParagraphStyle("title", parent=base, fontName="Helvetica-Bold", fontSize=9, leading=12,
                                textColor=colors.white, alignment=TA_CENTER),
        "right": ParagraphStyle("right", parent=base, alignment=TA_RIGHT),
        "bold": ParagraphStyle("bold", parent=base, fontName="Helvetica-Bold"),
        "center": ParagraphStyle("center", parent=base, alignment=TA_CENTER, textColor=colors.HexColor("#52525b")),
    }


def render_invoice(restaurant: Restaurant, bill: Bill, lines: list[BillLineOut]) -> bytes:
    s = RestaurantSettings.model_validate(restaurant.settings or {})
    brand = _brand(restaurant)
    st = _styles(brand)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A5, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
        title=f"Invoice {bill.invoice_number or bill.id}", author=restaurant.name,
    )
    width = doc.width
    story: list = []

    address = ", ".join(p for p in [restaurant.address_line, restaurant.city, restaurant.state, restaurant.pincode] if p)
    story.append(Paragraph(restaurant.name, st["name"]))
    if address:
        story.append(Paragraph(address, st["muted"]))
    ids = []
    if restaurant.phone:
        ids.append(f"Ph: {restaurant.phone}")
    if restaurant.gstin:
        ids.append(f"GSTIN: {restaurant.gstin}")
    if restaurant.fssai_number:
        ids.append(f"FSSAI: {restaurant.fssai_number}")
    if ids:
        story.append(Paragraph(" &nbsp;|&nbsp; ".join(ids), st["muted"]))
    story.append(Spacer(1, 4 * mm))

    title = Table([[Paragraph("TAX INVOICE" if restaurant.gstin else "INVOICE", st["title"])]], colWidths=[width])
    title.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), brand), ("TOPPADDING", (0, 0), (-1, -1), 4),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(title)
    story.append(Spacer(1, 3 * mm))

    paid_at: datetime | None = bill.paid_at or bill.created_at
    local = paid_at.astimezone(tz(restaurant)) if paid_at else None
    kind = {"dine_in": "Dine-in", "takeaway": "Takeaway", "delivery": "Delivery"}.get(bill.order_type, bill.order_type)
    if bill.table_label:
        kind += f" · Table {bill.table_label}"
    meta = [
        [Paragraph("<b>Invoice no.</b>", st["base"]), Paragraph(bill.invoice_number or "DRAFT", st["base"]),
         Paragraph("<b>Date</b>", st["base"]), Paragraph(local.strftime("%d %b %Y, %I:%M %p") if local else "-", st["base"])],
        [Paragraph("<b>Order</b>", st["base"]), Paragraph(kind, st["base"]),
         Paragraph("<b>Payment</b>", st["base"]), Paragraph((bill.payment_method or "-").upper(), st["base"])],
    ]
    if bill.customer_name or bill.customer_phone:
        meta.append([Paragraph("<b>Customer</b>", st["base"]),
                     Paragraph(" ".join(p for p in [bill.customer_name or "", bill.customer_phone or ""] if p), st["base"]),
                     "", ""])
    meta_table = Table(meta, colWidths=[width * 0.18, width * 0.34, width * 0.16, width * 0.32])
    meta_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                                    ("TOPPADDING", (0, 0), (-1, -1), 1), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(meta_table)
    story.append(Spacer(1, 3 * mm))

    rows = [[Paragraph("<b>#</b>", st["base"]), Paragraph("<b>Item</b>", st["base"]), Paragraph("<b>Qty</b>", st["right"]),
             Paragraph("<b>Rate</b>", st["right"]), Paragraph("<b>Amount</b>", st["right"])]]
    for idx, line in enumerate(lines, 1):
        name = line.name
        if line.modifiers:
            name += f"<br/><font size=7 color='#71717a'>{', '.join(line.modifiers)}</font>"
        rows.append([Paragraph(str(idx), st["base"]), Paragraph(name, st["base"]),
                     Paragraph(str(line.quantity), st["right"]), Paragraph(format_inr(line.unit_price), st["right"]),
                     Paragraph(format_inr(line.line_total), st["right"])])
    items = Table(rows, colWidths=[width * 0.07, width * 0.47, width * 0.1, width * 0.17, width * 0.19], repeatRows=1)
    items.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor("#27272a")),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#e4e4e7")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(items)
    story.append(Spacer(1, 2 * mm))

    totals: list[tuple[str, int]] = [("Subtotal", bill.subtotal)]
    if bill.discount:
        totals.append((f"Discount{f' ({bill.discount_reason})' if bill.discount_reason else ''}", -bill.discount))
    if bill.service_charge:
        totals.append((f"Service charge ({s.service_charge_percent:g}%, optional)", bill.service_charge))
    for tax in bill.taxes or []:
        label = f"{tax['name']} @ {tax['rate']:g}%"
        if s.prices_include_tax:
            label += " (incl.)"
        totals.append((label, tax["amount"]))
    if bill.delivery_fee:
        totals.append(("Delivery fee", bill.delivery_fee))
    if bill.round_off:
        totals.append(("Round off", bill.round_off))
    trows = [["", Paragraph(label, st["right"]), Paragraph(format_inr(value), st["right"])] for label, value in totals]
    trows.append(["", Paragraph("<b>Total (INR)</b>", st["right"]), Paragraph(f"<b>{format_inr(bill.total)}</b>", st["right"])])
    if bill.amount_paid:
        trows.append(["", Paragraph("Paid", st["right"]), Paragraph(format_inr(bill.amount_paid), st["right"])])
    ttable = Table(trows, colWidths=[width * 0.3, width * 0.45, width * 0.25])
    n = len(totals)
    ttable.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("LINEABOVE", (1, n), (-1, n), 0.8, colors.HexColor("#27272a")),
        ("BACKGROUND", (1, n), (-1, n), colors.HexColor("#fafafa")),
        ("TOPPADDING", (1, n), (-1, n), 4), ("BOTTOMPADDING", (1, n), (-1, n), 4),
    ]))
    story.append(ttable)
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(s.invoice_footer, st["center"]))
    story.append(Spacer(1, 1.5 * mm))
    story.append(Paragraph("This is a computer generated invoice. Powered by DineOS.",
                           ParagraphStyle("foot", parent=st["muted"], alignment=TA_CENTER)))
    doc.build(story)
    return buf.getvalue()


def _qr_drawing(value: str, size: float) -> Drawing:
    widget = QrCodeWidget(value, barLevel="M")
    x1, y1, x2, y2 = widget.getBounds()
    w, h = x2 - x1, y2 - y1
    drawing = Drawing(size, size, transform=[size / w, 0, 0, size / h, 0, 0])
    drawing.add(widget)
    return drawing


def render_qr_sheet(restaurant: Restaurant, tables: list[DiningTable], base_url: str) -> bytes:
    brand = _brand(restaurant)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"{restaurant.name} — table QR codes")
    page_w, page_h = A4
    cols, rows = 2, 2
    card_w, card_h = page_w / cols, page_h / rows
    per_page = cols * rows

    for index, table in enumerate(tables):
        slot = index % per_page
        if slot == 0 and index:
            c.showPage()
        col, row = slot % cols, slot // cols
        x0, y0 = col * card_w, page_h - (row + 1) * card_h
        cx = x0 + card_w / 2

        c.setStrokeColor(colors.HexColor("#d4d4d8"))
        c.setDash(3, 3)
        c.rect(x0 + 6, y0 + 6, card_w - 12, card_h - 12)
        c.setDash()

        c.setFillColor(brand)
        c.roundRect(x0 + 24, y0 + card_h - 74, card_w - 48, 46, 10, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(cx, y0 + card_h - 50, restaurant.name[:32])
        c.setFont("Helvetica", 9)
        c.drawCentredString(cx, y0 + card_h - 64, f"{table.area} · seats {table.capacity}")

        c.setFillColor(colors.HexColor("#18181b"))
        c.setFont("Helvetica-Bold", 30)
        c.drawCentredString(cx, y0 + card_h - 112, f"Table {table.label}")

        qr_size = 150
        url = f"{base_url.rstrip('/')}/t/{table.qr_token}"
        renderPDF.draw(_qr_drawing(url, qr_size), c, cx - qr_size / 2, y0 + 92)

        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(cx, y0 + 72, "Scan to view menu, order & pay")
        c.setFont("Helvetica", 8.5)
        c.setFillColor(colors.HexColor("#52525b"))
        c.drawCentredString(cx, y0 + 57, "No app needed · Call waiter · Get bill on WhatsApp")
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#a1a1aa"))
        c.drawCentredString(cx, y0 + 30, url)
    if not tables:
        c.setFont("Helvetica", 14)
        c.drawCentredString(page_w / 2, page_h / 2, "No tables yet — add tables in the dashboard.")
    c.save()
    return buf.getvalue()
