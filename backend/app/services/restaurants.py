import re
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import utcnow
from app.models import Bill, DiningTable, MenuCategory, MenuItem, Order, Restaurant, User
from app.models.billing import BillStatus
from app.models.restaurant import Role
from app.schemas.menu import CategoryOut, MenuOut
from app.schemas.restaurant import (
    OnboardingStep,
    PublicSettings,
    RestaurantOut,
    RestaurantPublicOut,
    RestaurantSettings,
)
from app.security import hash_password, random_token, short_code
from app.services.timeutil import is_open_now


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:50] or "restaurant"


async def unique_slug(db: AsyncSession, name: str) -> str:
    base = slugify(name)
    slug = base
    while await db.scalar(select(Restaurant.id).where(Restaurant.slug == slug)):
        slug = f"{base}-{short_code(4).lower()}"
    return slug


def restaurant_out(r: Restaurant) -> RestaurantOut:
    data = RestaurantOut.model_validate(r, from_attributes=True)
    data.settings = RestaurantSettings.model_validate(r.settings or {})
    return data


def public_restaurant(r: Restaurant) -> RestaurantPublicOut:
    s = RestaurantSettings.model_validate(r.settings or {})
    return RestaurantPublicOut(
        id=r.id,
        name=r.name,
        slug=r.slug,
        tagline=r.tagline,
        description=r.description,
        cuisines=r.cuisines or [],
        logo_url=r.logo_url,
        cover_url=r.cover_url,
        phone=r.phone,
        address_line=r.address_line,
        city=r.city,
        currency=r.currency,
        timezone=r.timezone,
        is_open_now=is_open_now(r),
        settings=PublicSettings.model_validate(s.model_dump()),
    )


async def load_by_slug(db: AsyncSession, slug: str) -> Restaurant:
    r = await db.scalar(select(Restaurant).where(Restaurant.slug == slug))
    if not r:
        raise HTTPException(404, "Restaurant not found")
    return r


async def menu_out(db: AsyncSession, restaurant: Restaurant, *, public: bool) -> MenuOut:
    stmt = select(MenuCategory).where(MenuCategory.restaurant_id == restaurant.id).order_by(
        MenuCategory.sort_order, MenuCategory.name
    )
    if public:
        stmt = stmt.where(MenuCategory.is_active.is_(True))
    categories = (await db.scalars(stmt)).all()
    out: list[CategoryOut] = []
    for cat in categories:
        c = CategoryOut.model_validate(cat)
        if public:
            c.items = [i for i in c.items if i.is_active]
            if not c.items:
                continue
        out.append(c)
    return MenuOut(version=restaurant.menu_version, categories=out)


def bump_menu(restaurant: Restaurant) -> None:
    restaurant.menu_version = (restaurant.menu_version or 0) + 1


async def create_restaurant_with_owner(
    db: AsyncSession,
    *,
    restaurant_name: str,
    owner_name: str,
    email: str,
    password: str,
    phone: str | None = None,
    city: str | None = None,
    slug: str | None = None,
    settings: dict | None = None,
) -> tuple[Restaurant, User]:
    email = email.lower().strip()
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    prefix = re.sub(r"[^A-Z]", "", restaurant_name.upper())[:3] or "INV"
    restaurant = Restaurant(
        name=restaurant_name.strip(),
        slug=slug or await unique_slug(db, restaurant_name),
        city=city,
        phone=phone,
        email=email,
        settings=RestaurantSettings(**{"invoice_prefix": prefix, **(settings or {})}).model_dump(),
        plan="growth",
        plan_status="trialing",
        trial_ends_at=utcnow() + timedelta(days=14),
    )
    db.add(restaurant)
    await db.flush()
    owner = User(
        restaurant_id=restaurant.id,
        name=owner_name.strip(),
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role=Role.OWNER,
    )
    db.add(owner)
    await db.flush()
    return restaurant, owner


def new_qr_token() -> str:
    return random_token(10)


async def onboarding(db: AsyncSession, restaurant: Restaurant) -> list[OnboardingStep]:
    rid = restaurant.id
    items = await db.scalar(select(func.count(MenuItem.id)).where(MenuItem.restaurant_id == rid)) or 0
    tables = await db.scalar(select(func.count(DiningTable.id)).where(DiningTable.restaurant_id == rid)) or 0
    staff = await db.scalar(select(func.count(User.id)).where(User.restaurant_id == rid)) or 0
    qr_orders = await db.scalar(
        select(func.count(Order.id)).where(Order.restaurant_id == rid, Order.source == "qr")
    ) or 0
    paid = await db.scalar(
        select(func.count(Bill.id)).where(Bill.restaurant_id == rid, Bill.status == BillStatus.PAID)
    ) or 0
    return [
        OnboardingStep(key="profile", title="Add address, GSTIN & FSSAI for invoices",
                       done=bool(restaurant.address_line and restaurant.gstin), href="/dashboard/settings"),
        OnboardingStep(key="menu", title="Build your menu (5+ dishes)", done=items >= 5, href="/dashboard/menu"),
        OnboardingStep(key="tables", title="Add tables & print QR codes", done=tables > 0, href="/dashboard/qr"),
        OnboardingStep(key="first_order", title="Take your first QR order", done=qr_orders > 0, href="/dashboard/qr"),
        OnboardingStep(key="first_payment", title="Settle your first bill", done=paid > 0, href="/dashboard/billing"),
        OnboardingStep(key="team", title="Invite your kitchen & cashier", done=staff > 1, href="/dashboard/staff"),
    ]
