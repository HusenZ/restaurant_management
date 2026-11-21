from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, IdMixin, TimestampMixin


class Notification(IdMixin, TimestampMixin, Base):
    """Audit log of every outbound message (WhatsApp, SMS, email)."""

    __tablename__ = "notifications"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(20))  # whatsapp | sms | email
    recipient: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(40))  # invoice | reservation_confirmed | order_ready
    status: Mapped[str] = mapped_column(String(20))  # sent | simulated | failed
    provider: Mapped[str] = mapped_column(String(20))
    provider_message_id: Mapped[str | None] = mapped_column(String(120))
    error: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class Counter(Base):
    """Atomic per-tenant sequences: daily order tokens, financial-year invoice numbers."""

    __tablename__ = "counters"

    restaurant_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0)
