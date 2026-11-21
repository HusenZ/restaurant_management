import secrets
import string
from datetime import timedelta
from typing import Any

import bcrypt
import jwt

from app.config import settings
from app.db import utcnow

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def _encode(claims: dict[str, Any], ttl: timedelta) -> str:
    now = utcnow()
    payload = {**claims, "iat": int(now.timestamp()), "exp": int((now + ttl).timestamp())}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])


def create_access_token(user_id: str, restaurant_id: str, role: str) -> str:
    return _encode(
        {"typ": "access", "sub": user_id, "rid": restaurant_id, "role": role},
        timedelta(minutes=settings.access_token_minutes),
    )


def create_refresh_token(user_id: str) -> str:
    return _encode({"typ": "refresh", "sub": user_id}, timedelta(days=settings.refresh_token_days))


def create_guest_token(restaurant_id: str, *, scope: str, ref_id: str, hours: int | None = None) -> str:
    """Guest tokens are scoped to exactly one resource: a dining session, an order or a reservation."""
    return _encode(
        {"typ": "guest", "rid": restaurant_id, "scope": scope, "ref": ref_id},
        timedelta(hours=hours or settings.guest_token_hours),
    )


def create_invoice_token(bill_id: str) -> str:
    return _encode({"typ": "invoice", "ref": bill_id}, timedelta(days=90))


def random_token(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def short_code(length: int = 6) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars
    return "".join(secrets.choice(alphabet) for _ in range(length))
