import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import init_db
from app.routers import analytics, auth, billing, menu, orders, public, reservations, restaurant, tables, ws
from app.services import scheduler
from app.services.realtime import broker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("dineos")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    if settings.seed_demo:
        from app.seed import seed_demo

        await seed_demo()
    await broker.start()
    task = asyncio.create_task(scheduler.loop())
    log.info("DineOS API ready · payments=%s · whatsapp=%s", settings.payment_provider, settings.whatsapp_provider)
    try:
        yield
    finally:
        task.cancel()
        await broker.stop()


app = FastAPI(
    title="DineOS API",
    version="1.0.0",
    description="Restaurant OS: QR dine-in ordering & payments, reservations with pre-order, takeaway/delivery, "
    "kitchen display, billing and analytics.",
    lifespan=lifespan,
)

origins = settings.cors_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials="*" not in origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

API = "/api/v1"
for r in (auth, restaurant, menu, tables, orders, billing, reservations, analytics, public):
    app.include_router(r.router, prefix=API)
app.include_router(ws.router)

settings.media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")


@app.get("/health", tags=["meta"])
async def health():
    return {"ok": True, "service": "dineos-api"}
