from datetime import datetime

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, IdMixin, TimestampMixin, UTCDateTime


class Role:
    OWNER = "owner"
    MANAGER = "manager"
    CASHIER = "cashier"
    WAITER = "waiter"
    KITCHEN = "kitchen"
    ALL = (OWNER, MANAGER, CASHIER, WAITER, KITCHEN)


class Restaurant(IdMixin, TimestampMixin, Base):
    __tablename__ = "restaurants"

    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    tagline: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    cuisines: Mapped[list] = mapped_column(JSON, default=list)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    cover_url: Mapped[str | None] = mapped_column(String(500))

    phone: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(200))
    whatsapp_number: Mapped[str | None] = mapped_column(String(20))
    address_line: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80))
    pincode: Mapped[str | None] = mapped_column(String(12))
    country: Mapped[str] = mapped_column(String(2), default="IN")
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")

    gstin: Mapped[str | None] = mapped_column(String(20))
    fssai_number: Mapped[str | None] = mapped_column(String(20))

    settings: Mapped[dict] = mapped_column(JSON, default=dict)

    plan: Mapped[str] = mapped_column(String(20), default="growth")
    plan_status: Mapped[str] = mapped_column(String(20), default="trialing")
    trial_ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    menu_version: Mapped[int] = mapped_column(Integer, default=1)


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default=Role.OWNER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
