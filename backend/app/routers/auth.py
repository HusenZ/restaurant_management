import jwt
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.db import utcnow
from app.deps import DB, Staff
from app.models import Restaurant, User
from app.sample_data import add_sample_menu, add_sample_tables
from app.schemas.restaurant import LoginIn, MeOut, RefreshIn, SignupIn, TokenOut, UserOut
from app.security import create_access_token, create_refresh_token, decode_token, verify_password
from app.services.restaurants import create_restaurant_with_owner, restaurant_out

router = APIRouter(prefix="/auth", tags=["auth"])


def _tokens(user: User, restaurant: Restaurant) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user.id, restaurant.id, user.role),
        refresh_token=create_refresh_token(user.id),
        user=UserOut.model_validate(user),
        restaurant=restaurant_out(restaurant),
    )


@router.post("/signup", response_model=TokenOut, status_code=201)
async def signup(data: SignupIn, db: DB):
    restaurant, owner = await create_restaurant_with_owner(
        db,
        restaurant_name=data.restaurant_name,
        owner_name=data.owner_name,
        email=data.email,
        password=data.password,
        phone=data.phone,
        city=data.city,
    )
    if data.with_sample_data:
        await add_sample_menu(db, restaurant)
        await add_sample_tables(db, restaurant)
    owner.last_login_at = utcnow()
    await db.commit()
    return _tokens(owner, restaurant)


@router.post("/login", response_model=TokenOut)
async def login(data: LoginIn, db: DB):
    user = await db.scalar(select(User).where(User.email == data.email.lower().strip()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account has been disabled by the owner")
    restaurant = await db.get(Restaurant, user.restaurant_id)
    user.last_login_at = utcnow()
    await db.commit()
    return _tokens(user, restaurant)


@router.post("/refresh", response_model=TokenOut)
async def refresh(data: RefreshIn, db: DB):
    try:
        claims = decode_token(data.refresh_token)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in again")
    if claims.get("typ") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in again")
    user = await db.get(User, claims["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in again")
    restaurant = await db.get(Restaurant, user.restaurant_id)
    return _tokens(user, restaurant)


@router.get("/me", response_model=MeOut)
async def me(ctx: Staff):
    return MeOut(user=UserOut.model_validate(ctx.user), restaurant=restaurant_out(ctx.restaurant))
