"""WhatsApp delivery of invoices.

- ConsoleProvider (default/dev): logs the message and records a `simulated` notification.
- MetaCloudProvider: uploads the PDF to the WhatsApp Cloud API and sends an approved template message with a
  document header (business-initiated messages require a template).
Every attempt is written to `notifications` for audit. The guest UI also offers a wa.me share link fallback.
"""

import logging
import re
from dataclasses import dataclass
from urllib.parse import quote

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Bill, Notification, Restaurant
from app.services.invoice_pdf import format_inr

log = logging.getLogger("dineos.whatsapp")
GRAPH = "https://graph.facebook.com/v21.0"


def normalize_phone(raw: str, default_country_code: str = "91") -> str:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = default_country_code + digits
    return digits


def invoice_message(restaurant: Restaurant, bill: Bill, url: str) -> str:
    return (
        f"Thank you for visiting {restaurant.name}! 🧾\n"
        f"Invoice {bill.invoice_number} · Total ₹{format_inr(bill.total)}\n"
        f"Download: {url}"
    )


def share_link(phone: str | None, text: str) -> str:
    target = normalize_phone(phone) if phone else ""
    return f"https://wa.me/{target}?text={quote(text)}"


@dataclass
class SendResult:
    status: str  # sent | simulated | failed
    provider: str
    message_id: str | None = None
    error: str | None = None


class ConsoleProvider:
    name = "console"

    async def send_document(self, *, to: str, pdf: bytes, filename: str, caption: str, params: list[str]) -> SendResult:
        log.info("[whatsapp:simulated] to=%s file=%s (%d bytes)\n%s", to, filename, len(pdf), caption)
        return SendResult(status="simulated", provider=self.name)


class MetaCloudProvider:
    name = "meta"

    def __init__(self, phone_number_id: str, token: str, template: str, language: str) -> None:
        self.phone_number_id = phone_number_id
        self.token = token
        self.template = template
        self.language = language

    async def send_document(self, *, to: str, pdf: bytes, filename: str, caption: str, params: list[str]) -> SendResult:
        headers = {"Authorization": f"Bearer {self.token}"}
        try:
            async with httpx.AsyncClient(timeout=20, headers=headers) as client:
                upload = await client.post(
                    f"{GRAPH}/{self.phone_number_id}/media",
                    data={"messaging_product": "whatsapp", "type": "application/pdf"},
                    files={"file": (filename, pdf, "application/pdf")},
                )
                upload.raise_for_status()
                media_id = upload.json()["id"]
                payload = {
                    "messaging_product": "whatsapp",
                    "to": to,
                    "type": "template",
                    "template": {
                        "name": self.template,
                        "language": {"code": self.language},
                        "components": [
                            {"type": "header", "parameters": [
                                {"type": "document", "document": {"id": media_id, "filename": filename}}]},
                            {"type": "body", "parameters": [{"type": "text", "text": p} for p in params]},
                        ],
                    },
                }
                sent = await client.post(f"{GRAPH}/{self.phone_number_id}/messages", json=payload)
                sent.raise_for_status()
                message_id = (sent.json().get("messages") or [{}])[0].get("id")
            return SendResult(status="sent", provider=self.name, message_id=message_id)
        except httpx.HTTPError as exc:
            detail = getattr(getattr(exc, "response", None), "text", "") or str(exc)
            log.warning("whatsapp send failed: %s", detail)
            return SendResult(status="failed", provider=self.name, error=detail[:500])


def get_provider():
    if settings.whatsapp_provider == "meta" and settings.whatsapp_phone_number_id and settings.whatsapp_access_token:
        return MetaCloudProvider(
            settings.whatsapp_phone_number_id,
            settings.whatsapp_access_token,
            settings.whatsapp_invoice_template,
            settings.whatsapp_template_language,
        )
    return ConsoleProvider()


async def send_invoice(
    db: AsyncSession, restaurant: Restaurant, bill: Bill, phone: str, pdf: bytes, url: str
) -> tuple[SendResult, str]:
    to = normalize_phone(phone)
    text = invoice_message(restaurant, bill, url)
    provider = get_provider()
    result = await provider.send_document(
        to=to,
        pdf=pdf,
        filename=f"invoice-{(bill.invoice_number or bill.id).replace('/', '-')}.pdf",
        caption=text,
        params=[bill.customer_name or "Guest", restaurant.name, f"₹{format_inr(bill.total)}"],
    )
    db.add(
        Notification(
            restaurant_id=restaurant.id,
            channel="whatsapp",
            recipient=to,
            kind="invoice",
            status=result.status,
            provider=result.provider,
            provider_message_id=result.message_id,
            error=result.error,
            payload={"bill_id": bill.id, "invoice_number": bill.invoice_number},
        )
    )
    if not bill.customer_phone:
        bill.customer_phone = phone
    await db.commit()
    return result, share_link(phone, text)
