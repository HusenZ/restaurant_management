from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Restaurant, User
from app.models.restaurant import Role
from app.security import decode_token

bearer = HTTPBearer(auto_error=False)
DB = Annotated[AsyncSession, Depends(get_db)]


@dataclass
class StaffCtx:
    user: User
    restaurant: Restaurant
    db: AsyncSession


async def staff_ctx(
    db: DB,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> StaffCtx:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    try:
        claims = decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    if claims.get("typ") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
    user = await db.get(User, claims["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account disabled")
    restaurant = await db.get(Restaurant, user.restaurant_id)
    if not restaurant:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Restaurant not found")
    return StaffCtx(user=user, restaurant=restaurant, db=db)


Staff = Annotated[StaffCtx, Depends(staff_ctx)]


def roles(*allowed: str):
    """Owner is always allowed; manager is allowed wherever any operational role is."""

    async def checker(ctx: Staff) -> StaffCtx:
        role = ctx.user.role
        if role == Role.OWNER or role in allowed:
            return ctx
        if role == Role.MANAGER and Role.MANAGER not in allowed and set(allowed) & {Role.CASHIER, Role.WAITER, Role.KITCHEN}:
            return ctx
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role does not allow this action")

    return Depends(checker)


Manager = Annotated[StaffCtx, roles(Role.MANAGER)]
Cashier = Annotated[StaffCtx, roles(Role.MANAGER, Role.CASHIER)]
FloorStaff = Annotated[StaffCtx, roles(Role.MANAGER, Role.CASHIER, Role.WAITER)]
KitchenStaff = Annotated[StaffCtx, roles(Role.MANAGER, Role.KITCHEN, Role.WAITER, Role.CASHIER)]
Owner = Annotated[StaffCtx, roles(Role.OWNER)]


@dataclass
class GuestCtx:
    restaurant_id: str
    scope: str  # session | order | reservation
    ref: str


def parse_guest_token(token: str | None) -> GuestCtx:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing guest token")
    try:
        claims = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This link has expired — please scan the QR again")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid guest token")
    if claims.get("typ") != "guest":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid guest token")
    return GuestCtx(restaurant_id=claims["rid"], scope=claims["scope"], ref=claims["ref"])


async def guest_ctx(x_guest_token: Annotated[str | None, Header()] = None) -> GuestCtx:
    return parse_guest_token(x_guest_token)


Guest = Annotated[GuestCtx, Depends(guest_ctx)]
