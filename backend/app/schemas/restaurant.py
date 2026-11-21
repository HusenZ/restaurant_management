import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORM

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class TaxRule(BaseModel):
    name: str = Field(min_length=1, max_length=20)
    rate: float = Field(ge=0, le=50)


class RestaurantSettings(BaseModel):
    dine_in_enabled: bool = True
    takeaway_enabled: bool = True
    delivery_enabled: bool = False
    reservations_enabled: bool = True
    preorder_enabled: bool = True
    online_payment_enabled: bool = True
    pay_at_counter_enabled: bool = True
    auto_accept_orders: bool = False
    avg_prep_minutes: int = Field(default=20, ge=1, le=240)

    taxes: list[TaxRule] = Field(
        default_factory=lambda: [TaxRule(name="CGST", rate=2.5), TaxRule(name="SGST", rate=2.5)]
    )
    prices_include_tax: bool = False
    service_charge_percent: float = Field(default=0, ge=0, le=20)
    round_off: bool = True

    delivery_fee: int = Field(default=4000, ge=0)
    min_delivery_order: int = Field(default=20000, ge=0)
    delivery_radius_km: float = Field(default=5, ge=0)

    opening_time: str = "11:00"
    closing_time: str = "23:00"
    closed_weekdays: list[int] = Field(default_factory=list)  # 0=Mon .. 6=Sun

    reservation_slot_minutes: int = Field(default=30, ge=15, le=120)
    reservation_duration_minutes: int = Field(default=90, ge=30, le=360)
    max_party_size: int = Field(default=12, ge=1, le=100)
    preorder_fire_minutes_before: int = Field(default=15, ge=0, le=120)
    auto_confirm_reservations: bool = True

    counter_directions: str = "Please walk to the billing counter near the entrance."
    invoice_prefix: str = Field(default="INV", max_length=6)
    invoice_footer: str = "Thank you for dining with us!"
    theme_color: str = "#E8590C"

    @field_validator("theme_color")
    @classmethod
    def _color(cls, v: str) -> str:
        if not HEX_COLOR.match(v):
            raise ValueError("theme_color must be a hex colour like #E8590C")
        return v

    @field_validator("opening_time", "closing_time")
    @classmethod
    def _time(cls, v: str) -> str:
        if not HHMM.match(v):
            raise ValueError("time must be HH:MM")
        return v

    @field_validator("invoice_prefix")
    @classmethod
    def _prefix(cls, v: str) -> str:
        v = re.sub(r"[^A-Za-z0-9]", "", v).upper()
        return v or "INV"


class PublicSettings(BaseModel):
    dine_in_enabled: bool
    takeaway_enabled: bool
    delivery_enabled: bool
    reservations_enabled: bool
    preorder_enabled: bool
    online_payment_enabled: bool
    pay_at_counter_enabled: bool
    avg_prep_minutes: int
    prices_include_tax: bool
    service_charge_percent: float
    taxes: list[TaxRule]
    delivery_fee: int
    min_delivery_order: int
    opening_time: str
    closing_time: str
    closed_weekdays: list[int]
    max_party_size: int
    counter_directions: str
    theme_color: str


class RestaurantBase(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    tagline: str | None = Field(default=None, max_length=200)
    description: str | None = None
    cuisines: list[str] | None = None
    logo_url: str | None = None
    cover_url: str | None = None
    phone: str | None = None
    email: str | None = None
    whatsapp_number: str | None = None
    address_line: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    gstin: str | None = Field(default=None, max_length=20)
    fssai_number: str | None = Field(default=None, max_length=20)


class RestaurantUpdate(RestaurantBase):
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$")


class RestaurantOut(ORM):
    id: str
    name: str
    slug: str
    tagline: str | None
    description: str | None
    cuisines: list[str]
    logo_url: str | None
    cover_url: str | None
    phone: str | None
    email: str | None
    whatsapp_number: str | None
    address_line: str | None
    city: str | None
    state: str | None
    pincode: str | None
    country: str
    currency: str
    timezone: str
    gstin: str | None
    fssai_number: str | None
    plan: str
    plan_status: str
    trial_ends_at: datetime | None
    created_at: datetime
    settings: RestaurantSettings


class RestaurantPublicOut(BaseModel):
    id: str
    name: str
    slug: str
    tagline: str | None
    description: str | None
    cuisines: list[str]
    logo_url: str | None
    cover_url: str | None
    phone: str | None
    address_line: str | None
    city: str | None
    currency: str
    timezone: str
    is_open_now: bool
    settings: PublicSettings


class UserOut(ORM):
    id: str
    name: str
    email: str
    phone: str | None
    role: str
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime


class SignupIn(BaseModel):
    restaurant_name: str = Field(min_length=2, max_length=120)
    owner_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)
    password: str = Field(min_length=8, max_length=72)
    city: str | None = None
    with_sample_data: bool = True


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut
    restaurant: RestaurantOut


class MeOut(BaseModel):
    user: UserOut
    restaurant: RestaurantOut


class StaffCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = None
    role: str = Field(pattern=r"^(manager|cashier|waiter|kitchen)$")
    password: str = Field(min_length=8, max_length=72)


class StaffUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    role: str | None = Field(default=None, pattern=r"^(manager|cashier|waiter|kitchen)$")
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=72)


class OnboardingStep(BaseModel):
    key: str
    title: str
    done: bool
    href: str


class PlanOut(BaseModel):
    id: str
    name: str
    price_monthly: int
    price_yearly: int
    tagline: str
    highlight: bool
    features: list[str]
    limits: dict[str, int | None]
