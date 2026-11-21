from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.db import utcnow
from app.models import Restaurant
from app.schemas.restaurant import RestaurantSettings


def tz(restaurant: Restaurant) -> ZoneInfo:
    try:
        return ZoneInfo(restaurant.timezone or "Asia/Kolkata")
    except Exception:
        return ZoneInfo("UTC")


def local_now(restaurant: Restaurant) -> datetime:
    return utcnow().astimezone(tz(restaurant))


def local_date(restaurant: Restaurant, at: datetime | None = None) -> date:
    return (at or utcnow()).astimezone(tz(restaurant)).date()


def parse_hhmm(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


def day_bounds_utc(restaurant: Restaurant, day: date) -> tuple[datetime, datetime]:
    zone = tz(restaurant)
    start = datetime.combine(day, time(0, 0), tzinfo=zone)
    return start.astimezone(ZoneInfo("UTC")), (start + timedelta(days=1)).astimezone(ZoneInfo("UTC"))


def opening_window(restaurant: Restaurant, day: date) -> tuple[datetime, datetime] | None:
    """Local open/close datetimes for a day; closing past midnight rolls into the next day."""
    s = RestaurantSettings.model_validate(restaurant.settings or {})
    if day.weekday() in s.closed_weekdays:
        return None
    zone = tz(restaurant)
    opens = datetime.combine(day, parse_hhmm(s.opening_time), tzinfo=zone)
    closes = datetime.combine(day, parse_hhmm(s.closing_time), tzinfo=zone)
    if closes <= opens:
        closes += timedelta(days=1)
    return opens, closes


def is_open_now(restaurant: Restaurant) -> bool:
    now = local_now(restaurant)
    for day in (now.date() - timedelta(days=1), now.date()):
        window = opening_window(restaurant, day)
        if window and window[0] <= now < window[1]:
            return True
    return False


def financial_year(at: datetime, restaurant: Restaurant) -> str:
    """Indian FY (Apr–Mar) label, e.g. 2026-11-19 -> '26-27'."""
    d = at.astimezone(tz(restaurant)).date()
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"
