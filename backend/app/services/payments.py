"""Payment gateway providers. Razorpay for production (UPI, cards, wallets); Mock for local development."""

import hashlib
import hmac
import secrets
from dataclasses import dataclass

import httpx

from app.config import settings


@dataclass
class GatewayOrder:
    provider_order_id: str
    key_id: str


class PaymentProvider:
    name = "base"

    async def create_order(self, *, amount: int, currency: str, receipt: str, notes: dict) -> GatewayOrder:
        raise NotImplementedError

    def verify_payment_signature(self, order_id: str, payment_id: str, signature: str) -> bool:
        raise NotImplementedError

    def verify_webhook(self, body: bytes, signature: str) -> bool:
        raise NotImplementedError


class MockProvider(PaymentProvider):
    """Simulates a gateway: the guest UI shows a fake UPI/card sheet and calls mock-complete."""

    name = "mock"

    async def create_order(self, *, amount: int, currency: str, receipt: str, notes: dict) -> GatewayOrder:
        return GatewayOrder(provider_order_id=f"mock_order_{secrets.token_hex(6)}", key_id="mock")

    def verify_payment_signature(self, order_id: str, payment_id: str, signature: str) -> bool:
        expected = hmac.new(settings.jwt_secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256)
        return hmac.compare_digest(expected.hexdigest(), signature)

    def verify_webhook(self, body: bytes, signature: str) -> bool:
        return False


class RazorpayProvider(PaymentProvider):
    name = "razorpay"
    base_url = "https://api.razorpay.com/v1"

    def __init__(self, key_id: str, key_secret: str, webhook_secret: str | None) -> None:
        self.key_id = key_id
        self.key_secret = key_secret
        self.webhook_secret = webhook_secret

    async def create_order(self, *, amount: int, currency: str, receipt: str, notes: dict) -> GatewayOrder:
        async with httpx.AsyncClient(timeout=15, auth=(self.key_id, self.key_secret)) as client:
            resp = await client.post(
                f"{self.base_url}/orders",
                json={"amount": amount, "currency": currency, "receipt": receipt[:40], "notes": notes},
            )
            resp.raise_for_status()
            data = resp.json()
        return GatewayOrder(provider_order_id=data["id"], key_id=self.key_id)

    def verify_payment_signature(self, order_id: str, payment_id: str, signature: str) -> bool:
        expected = hmac.new(self.key_secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256)
        return hmac.compare_digest(expected.hexdigest(), signature)

    def verify_webhook(self, body: bytes, signature: str) -> bool:
        if not self.webhook_secret:
            return False
        expected = hmac.new(self.webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)


def get_provider() -> PaymentProvider:
    if settings.payment_provider == "razorpay" and settings.razorpay_key_id and settings.razorpay_key_secret:
        return RazorpayProvider(settings.razorpay_key_id, settings.razorpay_key_secret, settings.razorpay_webhook_secret)
    return MockProvider()


def mock_signature(order_id: str, payment_id: str) -> str:
    return hmac.new(settings.jwt_secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
