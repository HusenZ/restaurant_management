from datetime import datetime

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, IdMixin, TimestampMixin, UTCDateTime, utcnow


class Diet:
    VEG = "veg"
    NON_VEG = "non_veg"
    EGG = "egg"
    VEGAN = "vegan"
    ALL = (VEG, NON_VEG, EGG, VEGAN)


class MenuCategory(IdMixin, TimestampMixin, Base):
    __tablename__ = "menu_categories"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(300))
    icon: Mapped[str | None] = mapped_column(String(16))  # emoji shown in chips / image placeholders
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    items: Mapped[list["MenuItem"]] = relationship(
        back_populates="category",
        lazy="selectin",
        order_by="MenuItem.sort_order",
        cascade="all, delete-orphan",
    )


class MenuItem(IdMixin, TimestampMixin, Base):
    __tablename__ = "menu_items"

    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[str] = mapped_column(ForeignKey("menu_categories.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(140))
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[int] = mapped_column(Integer)  # minor units (paise)
    image_url: Mapped[str | None] = mapped_column(String(500))
    diet: Mapped[str] = mapped_column(String(10), default=Diet.VEG)
    tags: Mapped[list] = mapped_column(JSON, default=list)  # bestseller, chef_special, new, spicy
    spice_level: Mapped[int] = mapped_column(Integer, default=0)  # 0-3
    prep_minutes: Mapped[int] = mapped_column(Integer, default=15)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    category: Mapped[MenuCategory] = relationship(back_populates="items")
    modifier_groups: Mapped[list["ModifierGroup"]] = relationship(
        back_populates="item",
        lazy="selectin",
        order_by="ModifierGroup.sort_order",
        cascade="all, delete-orphan",
    )


class ModifierGroup(IdMixin, Base):
    __tablename__ = "modifier_groups"

    item_id: Mapped[str] = mapped_column(ForeignKey("menu_items.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    min_select: Mapped[int] = mapped_column(Integer, default=0)
    max_select: Mapped[int] = mapped_column(Integer, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    item: Mapped[MenuItem] = relationship(back_populates="modifier_groups")
    options: Mapped[list["ModifierOption"]] = relationship(
        back_populates="group",
        lazy="selectin",
        order_by="ModifierOption.sort_order",
        cascade="all, delete-orphan",
    )


class ModifierOption(IdMixin, Base):
    __tablename__ = "modifier_options"

    group_id: Mapped[str] = mapped_column(ForeignKey("modifier_groups.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    price_delta: Mapped[int] = mapped_column(Integer, default=0)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    group: Mapped[ModifierGroup] = relationship(back_populates="options")
