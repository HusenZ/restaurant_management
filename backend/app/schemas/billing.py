from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORM


class TaxLineOut(BaseModel):
    name: str
    rate: float
    amount: int


class PaymentOut(ORM):
    id: str
    method: str
    provider: str
    status: str
    amount: int
    tendered: int | None
    change_due: int | None
    provider_payment_id: str | None
    created_at: datetime
    completed_at: datetime | None


class BillLineOut(BaseModel):
    name: str
    diet: str
    quantity: int
    unit_price: int
    line_total: int
    modifiers: list[str]


class BillOut(ORM):
    id: str
    session_id: str | None
    order_id: str | None
    order_type: str
    table_label: str | None
    invoice_number: str | None
    status: str
    subtotal: int
    discount: int
    discount_reason: str | None
    service_charge: int
    taxes: list[TaxLineOut]
    tax_total: int
    delivery_fee: int
    round_off: int
    total: int
    amount_paid: int
    customer_name: str | None
    customer_phone: str | None
    pay_preference: str | None
    counter_requested_at: datetime | None
    paid_at: datetime | None
    payment_method: str | None
    created_at: datetime
    payments: list[PaymentOut]


class BillDetailOut(BillOut):
    lines: list[BillLineOut] = Field(default_factory=list)
    invoice_url: str | None = None
    has_feedback: bool = False


class PayIn(BaseModel):
    mode: str = Field(pattern=r"^(online|counter)$")
    customer_phone: str | None = Field(default=None, max_length=20)
    customer_name: str | None = Field(default=None, max_length=120)


class CheckoutOut(BaseModel):
    mode: str
    bill: BillDetailOut
    payment_id: str | None = None
    provider: str | None = None
    provider_order_id: str | None = None
    key_id: str | None = None
    amount: int | None = None
    currency: str | None = None
    restaurant_name: str | None = None


class VerifyIn(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


class MockCompleteIn(BaseModel):
    success: bool = True
    method: str = Field(default="upi", pattern=r"^(upi|card)$")


class CollectIn(BaseModel):
    method: str = Field(pattern=r"^(cash|card|upi)$")
    tendered: int | None = Field(default=None, ge=0)
    customer_phone: str | None = None


class DiscountIn(BaseModel):
    kind: str = Field(default="flat", pattern=r"^(flat|percent)$")
    value: float = Field(ge=0)
    reason: str | None = Field(default=None, max_length=200)


class WhatsAppIn(BaseModel):
    phone: str = Field(min_length=8, max_length=20)


class WhatsAppOut(BaseModel):
    status: str
    simulated: bool
    share_url: str
    message: str


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)


class FeedbackOut(ORM):
    id: str
    bill_id: str
    rating: int
    comment: str | None
    customer_name: str | None
    created_at: datetime
