import secrets
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlalchemy import func, select

from app.config import settings
from app.deps import Manager, Owner, Staff
from app.models import Feedback, Notification, User
from app.models.restaurant import Role
from app.schemas.billing import FeedbackOut
from app.schemas.restaurant import (
    OnboardingStep,
    PlanOut,
    RestaurantOut,
    RestaurantSettings,
    RestaurantUpdate,
    StaffCreate,
    StaffUpdate,
    UserOut,
)
from app.security import hash_password
from app.services import realtime
from app.services.restaurants import onboarding, restaurant_out

router = APIRouter(tags=["restaurant"])

PLANS = [
    PlanOut(id="starter", name="Starter", price_monthly=999_00, price_yearly=9_590_00, highlight=False,
            tagline="For cafés & quick-service counters",
            features=["QR menu & table ordering", "Pay at counter + PDF invoices", "Live orders board",
                      "Up to 15 tables", "3 staff logins", "0% commission"],
            limits={"tables": 15, "staff": 3, "outlets": 1}),
    PlanOut(id="growth", name="Growth", price_monthly=2_499_00, price_yearly=23_990_00, highlight=True,
            tagline="Everything a busy restaurant needs",
            features=["Everything in Starter", "Online payments (UPI, cards)", "WhatsApp invoices",
                      "Table booking with pre-order", "Kitchen display (KDS)", "Takeaway & delivery storefront",
                      "Analytics & feedback", "Unlimited tables, 15 staff"],
            limits={"tables": None, "staff": 15, "outlets": 1}),
    PlanOut(id="pro", name="Pro", price_monthly=4_999_00, price_yearly=47_990_00, highlight=False,
            tagline="Multi-outlet brands & fine dining",
            features=["Everything in Growth", "Multi-outlet dashboard", "Custom domain & branding",
                      "API & webhooks", "Advanced analytics & exports", "Priority support"],
            limits={"tables": None, "staff": None, "outlets": 10}),
]


@router.get("/plans", response_model=list[PlanOut])
async def plans():
    return PLANS


@router.get("/restaurant", response_model=RestaurantOut)
async def get_restaurant(ctx: Staff):
    return restaurant_out(ctx.restaurant)


@router.patch("/restaurant", response_model=RestaurantOut)
async def update_restaurant(data: RestaurantUpdate, ctx: Manager):
    from app.models import Restaurant

    r = ctx.restaurant
    payload = data.model_dump(exclude_unset=True)
    if "slug" in payload and payload["slug"] != r.slug:
        taken = await ctx.db.scalar(select(Restaurant.id).where(Restaurant.slug == payload["slug"]))
        if taken:
            raise HTTPException(409, "That link is already taken")
    for key, value in payload.items():
        setattr(r, key, value)
    await ctx.db.commit()
    return restaurant_out(r)


@router.patch("/restaurant/settings", response_model=RestaurantOut)
async def update_settings(data: dict, ctx: Manager):
    r = ctx.restaurant
    merged = {**RestaurantSettings.model_validate(r.settings or {}).model_dump(), **data}
    try:
        validated = RestaurantSettings.model_validate(merged)
    except Exception as exc:
        raise HTTPException(422, str(exc))
    r.settings = validated.model_dump()
    r.menu_version += 1  # prices/taxes shown on menus may change
    await ctx.db.commit()
    await realtime.emit([realtime.staff_channel(r.id)], "menu.updated", {})
    return restaurant_out(r)


@router.post("/restaurant/plan", response_model=RestaurantOut)
async def change_plan(data: dict, ctx: Owner):
    plan = data.get("plan")
    if plan not in {p.id for p in PLANS}:
        raise HTTPException(422, "Unknown plan")
    ctx.restaurant.plan = plan
    await ctx.db.commit()
    return restaurant_out(ctx.restaurant)


@router.get("/restaurant/onboarding", response_model=list[OnboardingStep])
async def get_onboarding(ctx: Staff):
    return await onboarding(ctx.db, ctx.restaurant)


@router.get("/restaurant/integrations")
async def integrations(ctx: Staff):
    return {
        "payments": {"provider": settings.payment_provider if settings.razorpay_key_id else "mock",
                     "live": bool(settings.razorpay_key_id)},
        "whatsapp": {"provider": settings.whatsapp_provider if settings.whatsapp_access_token else "console",
                     "live": bool(settings.whatsapp_access_token)},
        "realtime": {"broker": "redis" if settings.redis_url else "in-memory", **realtime.hub.stats()},
    }


@router.get("/notifications")
async def list_notifications(ctx: Manager, limit: int = 50):
    rows = (await ctx.db.scalars(
        select(Notification).where(Notification.restaurant_id == ctx.restaurant.id)
        .order_by(Notification.created_at.desc()).limit(min(limit, 200))
    )).all()
    return [{"id": n.id, "channel": n.channel, "recipient": n.recipient, "kind": n.kind, "status": n.status,
             "provider": n.provider, "error": n.error, "created_at": n.created_at} for n in rows]


@router.get("/feedback", response_model=list[FeedbackOut])
async def list_feedback(ctx: Manager, limit: int = 50):
    rows = (await ctx.db.scalars(
        select(Feedback).where(Feedback.restaurant_id == ctx.restaurant.id)
        .order_by(Feedback.created_at.desc()).limit(min(limit, 200))
    )).all()
    return rows


# ---- staff ----------------------------------------------------------------------------------------------

@router.get("/staff", response_model=list[UserOut])
async def list_staff(ctx: Manager):
    return (await ctx.db.scalars(
        select(User).where(User.restaurant_id == ctx.restaurant.id).order_by(User.created_at)
    )).all()


@router.post("/staff", response_model=UserOut, status_code=201)
async def create_staff(data: StaffCreate, ctx: Manager):
    email = data.email.lower().strip()
    if await ctx.db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "A user with this email already exists")
    if data.role == Role.MANAGER and ctx.user.role != Role.OWNER:
        raise HTTPException(403, "Only the owner can add managers")
    count = await ctx.db.scalar(select(func.count(User.id)).where(User.restaurant_id == ctx.restaurant.id)) or 0
    limit = next(p.limits["staff"] for p in PLANS if p.id == ctx.restaurant.plan)
    if limit and count >= limit:
        raise HTTPException(402, f"Your plan allows {limit} staff logins — upgrade to add more")
    user = User(restaurant_id=ctx.restaurant.id, name=data.name, email=email, phone=data.phone, role=data.role,
                password_hash=hash_password(data.password))
    ctx.db.add(user)
    await ctx.db.commit()
    return user


@router.patch("/staff/{user_id}", response_model=UserOut)
async def update_staff(user_id: str, data: StaffUpdate, ctx: Manager):
    user = await ctx.db.get(User, user_id)
    if not user or user.restaurant_id != ctx.restaurant.id:
        raise HTTPException(404, "Staff member not found")
    if user.role == Role.OWNER:
        raise HTTPException(403, "The owner account can't be edited here")
    payload = data.model_dump(exclude_unset=True)
    if "password" in payload:
        user.password_hash = hash_password(payload.pop("password"))
    for k, v in payload.items():
        setattr(user, k, v)
    await ctx.db.commit()
    return user


# ---- uploads --------------------------------------------------------------------------------------------

ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


@router.post("/uploads")
async def upload_image(ctx: Manager, file: UploadFile = File(...)):
    ext = ALLOWED.get(file.content_type or "")
    if not ext:
        raise HTTPException(415, "Please upload a JPG, PNG or WebP image")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "Images must be under 5 MB")
    folder: Path = settings.media_dir / "uploads" / ctx.restaurant.id
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{secrets.token_hex(8)}{ext}"
    (folder / name).write_bytes(data)
    return {"url": f"{settings.public_api_url}/media/uploads/{ctx.restaurant.id}/{name}"}
