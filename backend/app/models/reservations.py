from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, IdMixin, TimestampMixin, UTCDateTime


class ReservationStatus:
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SEATED = "seated"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"
    ACTIVE = (PENDING, CONFIRMED, SEATED)


class Reservation(IdMixin, TimestampMixin, Base):
    __tablename__ = "reservations"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(12), index=True)
    customer_name: Mapped[str] = mapped_column(String(120))
    customer_phone: Mapped[str] = mapped_column(String(20))
    customer_email: Mapped[str | None] = mapped_column(String(200))
    party_size: Mapped[int] = mapped_column(Integer)
    reserved_for: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=90)
    status: Mapped[str] = mapped_column(String(20), default=ReservationStatus.PENDING, index=True)
    occasion: Mapped[str | None] = mapped_column(String(40))
    notes: Mapped[str | None] = mapped_column(Text)
    table_id: Mapped[str | None] = mapped_column(String(32))
    session_id: Mapped[str | None] = mapped_column(String(32))
    preorder_order_id: Mapped[str | None] = mapped_column(String(32))
    guest_on_way_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    source: Mapped[str] = mapped_column(String(20), default="web")
