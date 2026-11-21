from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, IdMixin, TimestampMixin, UTCDateTime, utcnow


class SessionStatus:
    OPEN = "open"
    BILL_REQUESTED = "bill_requested"
    CLOSED = "closed"
    ACTIVE = (OPEN, BILL_REQUESTED)


class RequestKind:
    ALL = ("waiter", "water", "cutlery", "cleaning", "bill", "payment_help")


class DiningTable(IdMixin, TimestampMixin, Base):
    __tablename__ = "dining_tables"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(20))
    area: Mapped[str] = mapped_column(String(60), default="Main")
    capacity: Mapped[int] = mapped_column(Integer, default=4)
    qr_token: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class DiningSession(IdMixin, Base):
    __tablename__ = "dining_sessions"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    table_id: Mapped[str] = mapped_column(ForeignKey("dining_tables.id", ondelete="CASCADE"), index=True)
    reservation_id: Mapped[str | None] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(20), default=SessionStatus.OPEN, index=True)
    guest_name: Mapped[str | None] = mapped_column(String(120))
    guest_count: Mapped[int] = mapped_column(Integer, default=1)
    customer_phone: Mapped[str | None] = mapped_column(String(20))
    opened_by: Mapped[str] = mapped_column(String(20), default="guest")  # guest | staff | reservation
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class ServiceRequest(IdMixin, TimestampMixin, Base):
    __tablename__ = "service_requests"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    table_id: Mapped[str] = mapped_column(ForeignKey("dining_tables.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str | None] = mapped_column(String(32), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="waiter")
    note: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    resolved_by: Mapped[str | None] = mapped_column(String(32))
