from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    app_name: str = "DineOS"
    environment: str = "development"  # development | staging | production

    database_url: str = f"sqlite+aiosqlite:///{(BASE_DIR / 'dineos.db').as_posix()}"
    redis_url: str | None = None  # enables Redis pub/sub fan-out across API instances

    jwt_secret: str = "dev-only-change-me-please-32-bytes-min"
    access_token_minutes: int = 60 * 12
    refresh_token_days: int = 14
    guest_token_hours: int = 24

    # Comma separated list; "*" allows any origin (dev only — tokens are bearer, not cookies)
    cors_origins: str = "*"

    public_app_url: str = "http://localhost:3000"  # used in QR codes and invoice links
    public_api_url: str = "http://localhost:8000"

    media_dir: Path = BASE_DIR / "media"

    # Payments
    payment_provider: str = "mock"  # mock | razorpay
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    razorpay_webhook_secret: str | None = None
    online_payment_expiry_minutes: int = 15

    # WhatsApp
    whatsapp_provider: str = "console"  # console | meta
    whatsapp_phone_number_id: str | None = None
    whatsapp_access_token: str | None = None
    whatsapp_invoice_template: str = "invoice_document"
    whatsapp_template_language: str = "en"

    seed_demo: bool = True
    scheduler_interval_seconds: int = 30

    @property
    def is_dev(self) -> bool:
        return self.environment == "development"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
