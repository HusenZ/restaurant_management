from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORM
from app.schemas.orders import CartItemIn, OrderOut


class ReservationIn(BaseModel):
    customer_name: str = Field(min_length=1, max_length=120)
    customer_phone: str = Field(min_length=6, max_length=20)
    customer_email: str | None = Field(default=None, max_length=200)
    party_size: int = Field(ge=1, le=100)
    reserved_for: datetime
    occasion: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=500)
    preorder_items: list[CartItemIn] = Field(default_factory=list, max_length=60)
    preorder_notes: str | None = Field(default=None, max_length=500)


class ReservationUpdate(BaseModel):
    status: str | None = Field(default=None, pattern=r"^(pending|confirmed|cancelled|no_show|completed)$")
    notes: str | None = None
    table_id: str | None = None


class SeatIn(BaseModel):
    table_id: str


class ReservationOut(ORM):
    id: str
    code: str
    customer_name: str
    customer_phone: str
    customer_email: str | None
    party_size: int
    reserved_for: datetime
    duration_minutes: int
    status: str
    occasion: str | None
    notes: str | None
    table_id: str | None
    session_id: str | None
    preorder_order_id: str | None
    guest_on_way_at: datetime | None
    source: str
    created_at: datetime


class ReservationDetailOut(BaseModel):
    reservation: ReservationOut
    preorder: OrderOut | None
    table_label: str | None
    restaurant_name: str
    restaurant_slug: str
    restaurant_address: str | None


class ReservationCreatedOut(ReservationDetailOut):
    token: str


class SlotOut(BaseModel):
    time: datetime
    label: str
    available: bool
