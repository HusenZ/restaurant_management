from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORM


class CartItemIn(BaseModel):
    menu_item_id: str
    quantity: int = Field(ge=1, le=50)
    option_ids: list[str] = Field(default_factory=list, max_length=40)
    notes: str | None = Field(default=None, max_length=300)


class GuestOrderIn(BaseModel):
    """A round placed from the table QR."""

    items: list[CartItemIn] = Field(min_length=1, max_length=60)
    notes: str | None = Field(default=None, max_length=500)
    client_order_id: str | None = Field(default=None, max_length=64)
    guest_name: str | None = Field(default=None, max_length=120)


class DeliveryAddress(BaseModel):
    line1: str = Field(min_length=3, max_length=300)
    landmark: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, max_length=12)


class PublicOrderIn(BaseModel):
    """Takeaway / delivery from the storefront."""

    order_type: str = Field(pattern=r"^(takeaway|delivery)$")
    items: list[CartItemIn] = Field(min_length=1, max_length=60)
    customer_name: str = Field(min_length=1, max_length=120)
    customer_phone: str = Field(min_length=6, max_length=20)
    notes: str | None = Field(default=None, max_length=500)
    scheduled_for: datetime | None = None
    delivery_address: DeliveryAddress | None = None
    pay_mode: str = Field(default="online", pattern=r"^(online|counter)$")
    client_order_id: str | None = Field(default=None, max_length=64)


class StaffOrderIn(BaseModel):
    order_type: str = Field(default="dine_in", pattern=r"^(dine_in|takeaway|delivery)$")
    table_id: str | None = None
    items: list[CartItemIn] = Field(min_length=1, max_length=60)
    notes: str | None = Field(default=None, max_length=500)
    customer_name: str | None = None
    customer_phone: str | None = None
    client_order_id: str | None = Field(default=None, max_length=64)


class StatusUpdateIn(BaseModel):
    status: str
    reason: str | None = Field(default=None, max_length=200)


class ItemDoneIn(BaseModel):
    is_done: bool


class OrderItemOut(ORM):
    id: str
    menu_item_id: str | None
    name: str
    diet: str
    unit_price: int
    quantity: int
    modifiers: list[dict]
    notes: str | None
    line_total: int
    is_done: bool


class OrderOut(ORM):
    id: str
    number: int
    order_type: str
    status: str
    source: str
    session_id: str | None
    reservation_id: str | None
    table_id: str | None
    table_label: str | None
    customer_name: str | None
    customer_phone: str | None
    notes: str | None
    delivery_address: dict | None
    scheduled_for: datetime | None
    subtotal: int
    item_count: int
    created_at: datetime
    accepted_at: datetime | None
    ready_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    fired_at: datetime | None
    items: list[OrderItemOut]
