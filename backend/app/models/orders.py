from datetime import datetime

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, IdMixin, TimestampMixin, UTCDateTime


class OrderType:
    DINE_IN = "dine_in"
    TAKEAWAY = "takeaway"
    DELIVERY = "delivery"
    ALL = (DINE_IN, TAKEAWAY, DELIVERY)


class OrderStatus:
    PENDING_PAYMENT = "pending_payment"
    SCHEDULED = "scheduled"
    PLACED = "placed"
    PREPARING = "preparing"
    READY = "ready"
    OUT_FOR_DELIVERY = "out_for_delivery"
    SERVED = "served"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

    KITCHEN_ACTIVE = (PLACED, PREPARING, READY)
    BILLABLE_EXCLUDED = (CANCELLED,)


class Order(IdMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("restaurant_id", "client_order_id", name="uq_orders_client_order"),)

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str | None] = mapped_column(ForeignKey("dining_sessions.id", ondelete="SET NULL"), index=True)
    reservation_id: Mapped[str | None] = mapped_column(String(32), index=True)
    table_id: Mapped[str | None] = mapped_column(String(32), index=True)
    table_label: Mapped[str | None] = mapped_column(String(20))

    order_type: Mapped[str] = mapped_column(String(20), default=OrderType.DINE_IN)
    status: Mapped[str] = mapped_column(String(20), default=OrderStatus.PLACED, index=True)
    number: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(20), default="qr")  # qr | web | staff | reservation

    customer_name: Mapped[str | None] = mapped_column(String(120))
    customer_phone: Mapped[str | None] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text)
    delivery_address: Mapped[dict | None] = mapped_column(JSON)
    scheduled_for: Mapped[datetime | None] = mapped_column(UTCDateTime, index=True)
    client_order_id: Mapped[str | None] = mapped_column(String(64))

    subtotal: Mapped[int] = mapped_column(Integer, default=0)
    item_count: Mapped[int] = mapped_column(Integer, default=0)

    accepted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ready_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancel_reason: Mapped[str | None] = mapped_column(String(200))
    fired_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", lazy="selectin", cascade="all, delete-orphan"
    )


class OrderItem(IdMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    menu_item_id: Mapped[str | None] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(140))
    diet: Mapped[str] = mapped_column(String(10), default="veg")
    unit_price: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    modifiers: Mapped[list] = mapped_column(JSON, default=list)  # [{group, name, price_delta}]
    notes: Mapped[str | None] = mapped_column(String(300))
    line_total: Mapped[int] = mapped_column(Integer)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)

    order: Mapped[Order] = relationship(back_populates="items")
