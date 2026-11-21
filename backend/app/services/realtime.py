"""Realtime fan-out.

Domain code calls `emit(channels, type, data)` after committing. Events are delivered to every WebSocket
subscribed to those channels. With REDIS_URL set, events go through Redis pub/sub so every API instance
delivers to its own sockets (horizontal scaling). Clients treat events as invalidation hints and refetch.
"""

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

from app.config import settings
from app.db import utcnow

log = logging.getLogger("dineos.realtime")
REDIS_CHANNEL = "dineos:events"


class Hub:
    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)

    def subscribe(self, ws: WebSocket, channels: list[str]) -> None:
        for ch in channels:
            self._channels[ch].add(ws)

    def unsubscribe(self, ws: WebSocket, channels: list[str]) -> None:
        for ch in channels:
            conns = self._channels.get(ch)
            if conns:
                conns.discard(ws)
                if not conns:
                    self._channels.pop(ch, None)

    async def deliver(self, channel: str, message: str) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._channels.get(channel, ())):
            try:
                await ws.send_text(message)
            except Exception:  # socket closed mid-send
                dead.append(ws)
        for ws in dead:
            self.unsubscribe(ws, [channel])

    def stats(self) -> dict[str, int]:
        return {"channels": len(self._channels), "sockets": sum(len(v) for v in self._channels.values())}


hub = Hub()


class InMemoryBroker:
    async def start(self) -> None:  # pragma: no cover - nothing to start
        return None

    async def stop(self) -> None:  # pragma: no cover
        return None

    async def publish(self, channel: str, message: str) -> None:
        await hub.deliver(channel, message)


class RedisBroker:
    def __init__(self, url: str) -> None:
        import redis.asyncio as redis

        self._redis = redis.from_url(url, decode_responses=True)
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._listen())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
        await self._redis.aclose()

    async def publish(self, channel: str, message: str) -> None:
        await self._redis.publish(REDIS_CHANNEL, json.dumps({"c": channel, "m": message}))

    async def _listen(self) -> None:
        while True:
            try:
                pubsub = self._redis.pubsub()
                await pubsub.subscribe(REDIS_CHANNEL)
                async for msg in pubsub.listen():
                    if msg.get("type") != "message":
                        continue
                    envelope = json.loads(msg["data"])
                    await hub.deliver(envelope["c"], envelope["m"])
            except asyncio.CancelledError:
                raise
            except Exception:  # reconnect on transient redis failures
                log.exception("redis listener crashed; retrying in 2s")
                await asyncio.sleep(2)


broker = RedisBroker(settings.redis_url) if settings.redis_url else InMemoryBroker()


def staff_channel(restaurant_id: str) -> str:
    return f"staff:{restaurant_id}"


def session_channel(session_id: str) -> str:
    return f"session:{session_id}"


def order_channel(order_id: str) -> str:
    return f"order:{order_id}"


def reservation_channel(reservation_id: str) -> str:
    return f"reservation:{reservation_id}"


async def emit(channels: list[str | None], type_: str, data: dict[str, Any] | None = None) -> None:
    message = json.dumps({"type": type_, "data": data or {}, "ts": utcnow().isoformat()}, default=str)
    for ch in {c for c in channels if c}:
        try:
            await broker.publish(ch, message)
        except Exception:  # realtime must never break a request
            log.exception("failed to publish %s to %s", type_, ch)
