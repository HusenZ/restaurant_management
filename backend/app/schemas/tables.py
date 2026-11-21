from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.billing import BillDetailOut
from app.schemas.common import ORM
from app.schemas.orders import OrderOut
from app.schemas.restaurant import RestaurantPublicOut


class TableIn(BaseModel):
    label: str = Field(min_length=1, max_length=20)
    area: str = Field(default="Main", max_length=60)
    capacity: int = Field(default=4, ge=1, le=50)
    is_active: bool = True
    sort_order: int | None = None


class TableBulkIn(BaseModel):
    prefix: str = Field(default="T", max_length=8)
    start: int = Field(default=1, ge=0, le=9999)
    count: int = Field(ge=1, le=100)
    area: str = Field(default="Main", max_length=60)
    capacity: int = Field(default=4, ge=1, le=50)


class TableUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=20)
    area: str | None = Field(default=None, max_length=60)
    capacity: int | None = Field(default=None, ge=1, le=50)
    is_active: bool | None = None
    sort_order: int | None = None


class TableOut(ORM):
    id: str
    label: str
    area: str
    capacity: int
    qr_token: str
    is_active: bool
    sort_order: int


class ServiceRequestOut(ORM):
    id: str
    table_id: str
    session_id: str | None
    kind: str
    note: str | None
    status: str
    created_at: datetime
    resolved_at: datetime | None
    table_label: str | None = None


class SessionOut(ORM):
    id: str
    table_id: str
    reservation_id: str | None
    status: str
    guest_name: str | None
    guest_count: int
    customer_phone: str | None
    opened_by: str
    opened_at: datetime
    closed_at: datetime | None


class SessionDetailOut(BaseModel):
    session: SessionOut
    table: TableOut
    orders: list[OrderOut]
    bill: BillDetailOut | None
    running_total: int
    requests: list[ServiceRequestOut]


class LiveTableOut(BaseModel):
    table: TableOut
    state: str  # free | occupied | bill_requested | awaiting_counter | attention
    session: SessionOut | None
    orders_count: int
    active_orders: int
    running_total: int
    open_requests: list[ServiceRequestOut]
    bill_id: str | None
    upcoming_reservation: dict | None = None


class OpenSessionIn(BaseModel):
    table_id: str
    guest_count: int = Field(default=2, ge=1, le=50)
    guest_name: str | None = None
    customer_phone: str | None = None


class JoinSessionIn(BaseModel):
    guest_name: str | None = Field(default=None, max_length=120)
    guest_count: int | None = Field(default=None, ge=1, le=50)


class TableLookupOut(BaseModel):
    restaurant: RestaurantPublicOut
    table: dict
    active_session: dict | None


class GuestSessionOut(BaseModel):
    token: str
    session: SessionOut
    table: dict


class ServiceRequestIn(BaseModel):
    kind: str = Field(pattern=r"^(waiter|water|cutlery|cleaning|bill|payment_help)$")
    note: str | None = Field(default=None, max_length=200)
