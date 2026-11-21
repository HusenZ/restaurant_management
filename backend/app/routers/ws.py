import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db import SessionLocal
from app.models import User
from app.security import decode_token
from app.services import realtime

router = APIRouter()


async def _pump(ws: WebSocket, channels: list[str]) -> None:
    await ws.accept()
    realtime.hub.subscribe(ws, channels)
    await ws.send_json({"type": "hello", "data": {"channels": len(channels)}})
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    finally:
        realtime.hub.unsubscribe(ws, channels)


@router.websocket("/ws/staff")
async def staff_socket(ws: WebSocket, token: str = ""):
    try:
        claims = decode_token(token)
        if claims.get("typ") != "access":
            raise jwt.InvalidTokenError()
    except jwt.PyJWTError:
        await ws.close(code=4401)
        return
    async with SessionLocal() as db:
        user = await db.get(User, claims["sub"])
        if not user or not user.is_active:
            await ws.close(code=4403)
            return
        restaurant_id = user.restaurant_id
    await _pump(ws, [realtime.staff_channel(restaurant_id)])


@router.websocket("/ws/guest")
async def guest_socket(ws: WebSocket, token: str = ""):
    try:
        claims = decode_token(token)
        if claims.get("typ") != "guest":
            raise jwt.InvalidTokenError()
    except jwt.PyJWTError:
        await ws.close(code=4401)
        return
    channel = {
        "session": realtime.session_channel,
        "order": realtime.order_channel,
        "reservation": realtime.reservation_channel,
    }.get(claims.get("scope"))
    if not channel:
        await ws.close(code=4400)
        return
    await _pump(ws, [channel(claims["ref"])])
