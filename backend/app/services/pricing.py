"""Pricing in integer minor units (paise). No floats touch money except tax *rates*, handled via Decimal."""

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MenuItem
from app.schemas.orders import CartItemIn
from app.schemas.restaurant import RestaurantSettings


def _round(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


@dataclass
class PricedLine:
    menu_item_id: str
    name: str
    diet: str
    unit_price: int
    quantity: int
    modifiers: list[dict]
    notes: str | None
    prep_minutes: int

    @property
    def line_total(self) -> int:
        return self.unit_price * self.quantity


async def price_cart(db: AsyncSession, restaurant_id: str, items: list[CartItemIn]) -> list[PricedLine]:
    ids = {i.menu_item_id for i in items}
    rows = (
        await db.scalars(select(MenuItem).where(MenuItem.restaurant_id == restaurant_id, MenuItem.id.in_(ids)))
    ).all()
    by_id = {m.id: m for m in rows}
    lines: list[PricedLine] = []

    for cart_item in items:
        item = by_id.get(cart_item.menu_item_id)
        if not item or not item.is_active:
            raise HTTPException(422, f"Item is no longer on the menu ({cart_item.menu_item_id})")
        if not item.is_available:
            raise HTTPException(409, f"Sorry, '{item.name}' just went out of stock")

        chosen = set(cart_item.option_ids)
        known_options = {o.id for g in item.modifier_groups for o in g.options}
        unknown = chosen - known_options
        if unknown:
            raise HTTPException(422, f"Invalid options for '{item.name}'")

        modifiers: list[dict] = []
        unit = item.price
        for group in item.modifier_groups:
            selected = [o for o in group.options if o.id in chosen]
            if len(selected) < group.min_select:
                raise HTTPException(422, f"Please choose {group.name.lower()} for '{item.name}'")
            if len(selected) > group.max_select:
                raise HTTPException(422, f"Too many choices in {group.name} for '{item.name}'")
            for opt in selected:
                if not opt.is_available:
                    raise HTTPException(409, f"'{opt.name}' is unavailable for '{item.name}'")
                unit += opt.price_delta
                modifiers.append({"group": group.name, "name": opt.name, "price_delta": opt.price_delta})

        lines.append(
            PricedLine(
                menu_item_id=item.id,
                name=item.name,
                diet=item.diet,
                unit_price=max(unit, 0),
                quantity=cart_item.quantity,
                modifiers=modifiers,
                notes=(cart_item.notes or None),
                prep_minutes=item.prep_minutes,
            )
        )
    return lines


@dataclass
class Totals:
    subtotal: int
    discount: int
    service_charge: int
    taxes: list[dict] = field(default_factory=list)
    tax_total: int = 0
    delivery_fee: int = 0
    round_off: int = 0
    total: int = 0


def compute_totals(
    subtotal: int,
    settings: RestaurantSettings,
    *,
    discount: int = 0,
    delivery_fee: int = 0,
) -> Totals:
    discount = max(0, min(discount, subtotal))
    base = subtotal - discount
    service_charge = _round(Decimal(base) * Decimal(str(settings.service_charge_percent)) / 100)
    rates = [(t.name, Decimal(str(t.rate))) for t in settings.taxes if t.rate > 0]
    tax_lines: list[dict] = []

    if settings.prices_include_tax and rates:
        gross = base + service_charge
        total_rate = sum(r for _, r in rates)
        net = _round(Decimal(gross) * 100 / (100 + total_rate))
        tax_total = gross - net
        remaining = tax_total
        for idx, (name, rate) in enumerate(rates):
            amount = remaining if idx == len(rates) - 1 else _round(Decimal(net) * rate / 100)
            remaining -= amount
            tax_lines.append({"name": name, "rate": float(rate), "amount": amount})
        pre_round = gross + delivery_fee
    else:
        taxable = base + service_charge
        for name, rate in rates:
            tax_lines.append({"name": name, "rate": float(rate), "amount": _round(Decimal(taxable) * rate / 100)})
        tax_total = sum(t["amount"] for t in tax_lines)
        pre_round = taxable + tax_total + delivery_fee

    total = _round(Decimal(pre_round) / 100) * 100 if settings.round_off else pre_round
    return Totals(
        subtotal=subtotal,
        discount=discount,
        service_charge=service_charge,
        taxes=tax_lines,
        tax_total=tax_total,
        delivery_fee=delivery_fee,
        round_off=total - pre_round,
        total=total,
    )
