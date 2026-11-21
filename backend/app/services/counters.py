from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Counter


async def next_value(db: AsyncSession, restaurant_id: str, key: str) -> int:
    """Atomically increment and return a per-restaurant sequence (runs inside the caller's transaction)."""
    for _ in range(3):
        result = await db.execute(
            update(Counter)
            .where(Counter.restaurant_id == restaurant_id, Counter.key == key)
            .values(value=Counter.value + 1)
            .returning(Counter.value)
        )
        value = result.scalar_one_or_none()
        if value is not None:
            return value
        try:
            async with db.begin_nested():
                db.add(Counter(restaurant_id=restaurant_id, key=key, value=1))
            return 1
        except IntegrityError:
            continue  # another request created it first; retry the increment
    row = await db.scalar(select(Counter).where(Counter.restaurant_id == restaurant_id, Counter.key == key))
    raise RuntimeError(f"could not allocate counter {key}: {row}")
