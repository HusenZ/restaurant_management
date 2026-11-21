from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORM

DIET_PATTERN = r"^(veg|non_veg|egg|vegan)$"


class ModifierOptionIn(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=100)
    price_delta: int = Field(default=0, ge=-10_000_00, le=10_000_00)
    is_available: bool = True
    is_default: bool = False


class ModifierGroupIn(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=100)
    min_select: int = Field(default=0, ge=0, le=20)
    max_select: int = Field(default=1, ge=1, le=20)
    options: list[ModifierOptionIn] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def _check(self):
        if self.min_select > self.max_select:
            raise ValueError("min_select cannot exceed max_select")
        return self


class MenuItemIn(BaseModel):
    category_id: str
    name: str = Field(min_length=1, max_length=140)
    description: str | None = Field(default=None, max_length=1000)
    price: int = Field(ge=0, le=10_000_000)
    image_url: str | None = None
    diet: str = Field(default="veg", pattern=DIET_PATTERN)
    tags: list[str] = Field(default_factory=list)
    spice_level: int = Field(default=0, ge=0, le=3)
    prep_minutes: int = Field(default=15, ge=0, le=240)
    is_available: bool = True
    is_active: bool = True
    sort_order: int | None = None
    modifier_groups: list[ModifierGroupIn] = Field(default_factory=list, max_length=10)


class MenuItemUpdate(BaseModel):
    category_id: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = None
    price: int | None = Field(default=None, ge=0, le=10_000_000)
    image_url: str | None = None
    diet: str | None = Field(default=None, pattern=DIET_PATTERN)
    tags: list[str] | None = None
    spice_level: int | None = Field(default=None, ge=0, le=3)
    prep_minutes: int | None = Field(default=None, ge=0, le=240)
    is_available: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    modifier_groups: list[ModifierGroupIn] | None = None


class AvailabilityIn(BaseModel):
    is_available: bool


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)
    icon: str | None = Field(default=None, max_length=16)
    sort_order: int | None = None
    is_active: bool = True


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=16)
    sort_order: int | None = None
    is_active: bool | None = None


class ModifierOptionOut(ORM):
    id: str
    name: str
    price_delta: int
    is_available: bool
    is_default: bool


class ModifierGroupOut(ORM):
    id: str
    name: str
    min_select: int
    max_select: int
    options: list[ModifierOptionOut]


class MenuItemOut(ORM):
    id: str
    category_id: str
    name: str
    description: str | None
    price: int
    image_url: str | None
    diet: str
    tags: list[str]
    spice_level: int
    prep_minutes: int
    is_available: bool
    is_active: bool
    sort_order: int
    modifier_groups: list[ModifierGroupOut]


class CategoryOut(ORM):
    id: str
    name: str
    description: str | None
    icon: str | None
    sort_order: int
    is_active: bool
    items: list[MenuItemOut]


class MenuOut(BaseModel):
    version: int
    categories: list[CategoryOut]
