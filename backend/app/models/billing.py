from datetime import datetime

from sqlalchemy import JSON, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, IdMixin, TimestampMixin, UTCDateTime


class BillStatus:
    OPEN = "open"
    PAID = "paid"
    VOID = "void"


class PaymentStatus:
    CREATED = "created"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class Bill(IdMixin, TimestampMixin, Base):
    __tablename__ = "bills"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str | None] = mapped_column(ForeignKey("dining_sessions.id", ondelete="SET NULL"), index=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    order_type: Mapped[str] = mapped_column(String(20), default="dine_in")
    table_label: Mapped[str | None] = mapped_column(String(20))

    invoice_number: Mapped[str | None] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(20), default=BillStatus.OPEN, index=True)

    subtotal: Mapped[int] = mapped_column(Integer, default=0)
    discount: Mapped[int] = mapped_column(Integer, default=0)
    discount_percent: Mapped[float | None] = mapped_column(Float)  # re-applied when rounds are added
    discount_reason: Mapped[str | None] = mapped_column(String(200))
    service_charge: Mapped[int] = mapped_column(Integer, default=0)
    taxes: Mapped[list] = mapped_column(JSON, default=list)  # [{name, rate, amount}]
    tax_total: Mapped[int] = mapped_column(Integer, default=0)
    delivery_fee: Mapped[int] = mapped_column(Integer, default=0)
    round_off: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    amount_paid: Mapped[int] = mapped_column(Integer, default=0)

    customer_name: Mapped[str | None] = mapped_column(String(120))
    customer_phone: Mapped[str | None] = mapped_column(String(20))
    pay_preference: Mapped[str | None] = mapped_column(String(20))  # online | counter
    counter_requested_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    paid_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    payment_method: Mapped[str | None] = mapped_column(String(20))

    payments: Mapped[list["Payment"]] = relationship(
        back_populates="bill", lazy="selectin", order_by="Payment.created_at"
    )


class Payment(IdMixin, TimestampMixin, Base):
    __tablename__ = "payments"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    bill_id: Mapped[str] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    method: Mapped[str] = mapped_column(String(20))  # upi | card | cash | online
    provider: Mapped[str] = mapped_column(String(20))  # razorpay | mock | manual
    status: Mapped[str] = mapped_column(String(20), default=PaymentStatus.CREATED, index=True)
    amount: Mapped[int] = mapped_column(Integer)
    tendered: Mapped[int | None] = mapped_column(Integer)
    change_due: Mapped[int | None] = mapped_column(Integer)
    provider_order_id: Mapped[str | None] = mapped_column(String(64), index=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(64), index=True)
    collected_by: Mapped[str | None] = mapped_column(String(32))
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    bill: Mapped[Bill] = relationship(back_populates="payments")


class Feedback(IdMixin, TimestampMixin, Base):
    __tablename__ = "feedback"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    bill_id: Mapped[str] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), index=True, unique=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text)
    customer_name: Mapped[str | None] = mapped_column(String(120))
