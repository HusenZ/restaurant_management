from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.deps import Manager, Staff, StaffCtx, KitchenStaff
from app.models import MenuCategory, MenuItem, ModifierGroup, ModifierOption
from app.schemas.menu import (
    AvailabilityIn,
    CategoryIn,
    CategoryOut,
    CategoryUpdate,
    MenuItemIn,
    MenuItemOut,
    MenuItemUpdate,
    MenuOut,
    ModifierGroupIn,
)
from app.services import realtime
from app.services.restaurants import bump_menu, menu_out

router = APIRouter(prefix="/menu", tags=["menu"])


async def _category(ctx: StaffCtx, category_id: str) -> MenuCategory:
    cat = await ctx.db.get(MenuCategory, category_id)
    if not cat or cat.restaurant_id != ctx.restaurant.id:
        raise HTTPException(404, "Category not found")
    return cat


async def _item(ctx: StaffCtx, item_id: str) -> MenuItem:
    item = await ctx.db.get(MenuItem, item_id)
    if not item or item.restaurant_id != ctx.restaurant.id:
        raise HTTPException(404, "Item not found")
    return item


def _groups(groups: list[ModifierGroupIn]) -> list[ModifierGroup]:
    out = []
    for g_idx, g in enumerate(groups):
        if g.max_select > max(len(g.options), 1):
            g.max_select = max(len(g.options), 1)
        out.append(
            ModifierGroup(
                name=g.name, min_select=g.min_select, max_select=g.max_select, sort_order=g_idx,
                options=[ModifierOption(name=o.name, price_delta=o.price_delta, is_available=o.is_available,
                                        is_default=o.is_default, sort_order=o_idx)
                         for o_idx, o in enumerate(g.options)],
            )
        )
    return out


async def _changed(ctx: StaffCtx) -> None:
    bump_menu(ctx.restaurant)
    await ctx.db.commit()
    await realtime.emit([realtime.staff_channel(ctx.restaurant.id)], "menu.updated", {})


@router.get("", response_model=MenuOut)
async def get_menu(ctx: Staff):
    return await menu_out(ctx.db, ctx.restaurant, public=False)


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(data: CategoryIn, ctx: Manager):
    order = data.sort_order
    if order is None:
        order = (await ctx.db.scalar(
            select(func.max(MenuCategory.sort_order)).where(MenuCategory.restaurant_id == ctx.restaurant.id)
        ) or 0) + 1
    cat = MenuCategory(restaurant_id=ctx.restaurant.id, name=data.name, description=data.description,
                       icon=data.icon, sort_order=order, is_active=data.is_active)
    cat.items = []
    ctx.db.add(cat)
    await _changed(ctx)
    return cat


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(category_id: str, data: CategoryUpdate, ctx: Manager):
    cat = await _category(ctx, category_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await _changed(ctx)
    await ctx.db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: str, ctx: Manager):
    cat = await _category(ctx, category_id)
    await ctx.db.delete(cat)
    await _changed(ctx)


@router.post("/items", response_model=MenuItemOut, status_code=201)
async def create_item(data: MenuItemIn, ctx: Manager):
    await _category(ctx, data.category_id)
    order = data.sort_order
    if order is None:
        order = (await ctx.db.scalar(
            select(func.max(MenuItem.sort_order)).where(MenuItem.category_id == data.category_id)
        ) or 0) + 1
    payload = data.model_dump(exclude={"modifier_groups", "sort_order"})
    item = MenuItem(restaurant_id=ctx.restaurant.id, sort_order=order, **payload)
    item.modifier_groups = _groups(data.modifier_groups)
    ctx.db.add(item)
    await _changed(ctx)
    await ctx.db.refresh(item, ["modifier_groups"])
    return item


@router.patch("/items/{item_id}", response_model=MenuItemOut)
async def update_item(item_id: str, data: MenuItemUpdate, ctx: Manager):
    item = await _item(ctx, item_id)
    payload = data.model_dump(exclude_unset=True, exclude={"modifier_groups"})
    if "category_id" in payload:
        await _category(ctx, payload["category_id"])
    for k, v in payload.items():
        setattr(item, k, v)
    if data.modifier_groups is not None:
        item.modifier_groups = _groups(data.modifier_groups)  # replace semantics; orders keep snapshots
    await _changed(ctx)
    await ctx.db.refresh(item, ["modifier_groups"])
    return item


@router.patch("/items/{item_id}/availability", response_model=MenuItemOut)
async def set_availability(item_id: str, data: AvailabilityIn, ctx: KitchenStaff):
    """Kitchen and floor staff can mark a dish sold out (\"86\") instantly."""
    item = await _item(ctx, item_id)
    item.is_available = data.is_available
    await _changed(ctx)
    return item


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(item_id: str, ctx: Manager):
    item = await _item(ctx, item_id)
    await ctx.db.delete(item)
    await _changed(ctx)
