"""Sample menu + tables used for new signups ("start with a sample menu") and the demo restaurant."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DiningTable, MenuCategory, MenuItem, ModifierGroup, ModifierOption, Restaurant
from app.services.restaurants import new_qr_token

R = 100  # rupee -> paise


def _portion(full_extra: int) -> dict:
    return {"name": "Portion", "min": 1, "max": 1,
            "options": [("Half", 0, True), ("Full", full_extra, False)]}


SPICE = {"name": "Spice level", "min": 0, "max": 1,
         "options": [("Mild", 0, False), ("Medium", 0, True), ("Hot", 0, False)]}

SAMPLE_MENU: list[dict] = [
    {
        "name": "Starters", "icon": "🥟", "description": "Fresh from the tandoor and wok",
        "items": [
            {"name": "Paneer Tikka", "price": 280 * R, "diet": "veg", "tags": ["bestseller"], "spice": 2, "prep": 15,
             "desc": "Cottage cheese marinated in hung curd & spices, chargrilled with peppers and onions.",
             "groups": [_portion(120 * R)]},
            {"name": "Chicken 65", "price": 290 * R, "diet": "non_veg", "tags": ["spicy"], "spice": 3, "prep": 15,
             "desc": "Crispy fried chicken tossed with curry leaves, chillies and garlic."},
            {"name": "Tandoori Chicken", "price": 340 * R, "diet": "non_veg", "tags": ["chef_special"], "spice": 2,
             "prep": 25, "desc": "Bone-in chicken marinated overnight, roasted in a clay oven.",
             "groups": [_portion(260 * R)]},
            {"name": "Hara Bhara Kabab", "price": 220 * R, "diet": "veg", "tags": [], "spice": 1, "prep": 12,
             "desc": "Spinach, peas and potato patties with mint chutney."},
            {"name": "Crispy Corn", "price": 210 * R, "diet": "vegan", "tags": ["new"], "spice": 1, "prep": 10,
             "desc": "Golden fried sweet corn tossed with pepper, onion and lime."},
        ],
    },
    {
        "name": "Main Course", "icon": "🍛", "description": "Slow-cooked curries, best with breads",
        "items": [
            {"name": "Butter Chicken", "price": 360 * R, "diet": "non_veg", "tags": ["bestseller", "chef_special"],
             "spice": 1, "prep": 20, "desc": "Tandoori chicken simmered in a velvety tomato, butter and cream gravy.",
             "groups": [SPICE]},
            {"name": "Paneer Butter Masala", "price": 310 * R, "diet": "veg", "tags": ["bestseller"], "spice": 1,
             "prep": 18, "desc": "Soft paneer cubes in a rich, mildly sweet makhani gravy.", "groups": [SPICE]},
            {"name": "Dal Makhani", "price": 260 * R, "diet": "veg", "tags": [], "spice": 0, "prep": 15,
             "desc": "Black lentils slow-cooked overnight with butter and cream."},
            {"name": "Kadai Paneer", "price": 300 * R, "diet": "veg", "tags": ["spicy"], "spice": 2, "prep": 18,
             "desc": "Paneer, capsicum and onion in a freshly ground kadai masala."},
            {"name": "Mutton Rogan Josh", "price": 420 * R, "diet": "non_veg", "tags": ["chef_special"], "spice": 2,
             "prep": 25, "desc": "Kashmiri-style tender mutton in an aromatic red gravy."},
            {"name": "Egg Curry", "price": 220 * R, "diet": "egg", "tags": [], "spice": 2, "prep": 15,
             "desc": "Boiled eggs in a home-style onion tomato masala."},
        ],
    },
    {
        "name": "Biryani & Rice", "icon": "🍚", "description": "Dum-cooked in sealed handis",
        "items": [
            {"name": "Hyderabadi Chicken Dum Biryani", "price": 340 * R, "diet": "non_veg", "tags": ["bestseller"],
             "spice": 2, "prep": 25, "desc": "Long-grain basmati layered with marinated chicken, saffron and fried onions.",
             "groups": [
                 {"name": "Size", "min": 1, "max": 1, "options": [("Regular", 0, True), ("Family pack (serves 3)", 300 * R, False)]},
                 {"name": "Add-ons", "min": 0, "max": 3, "options": [("Extra raita", 40 * R, False), ("Boiled egg", 20 * R, False), ("Mirchi ka salan", 50 * R, False)]},
             ]},
            {"name": "Veg Dum Biryani", "price": 260 * R, "diet": "veg", "tags": [], "spice": 2, "prep": 22,
             "desc": "Seasonal vegetables and basmati dum-cooked with whole spices.",
             "groups": [{"name": "Add-ons", "min": 0, "max": 2, "options": [("Extra raita", 40 * R, False), ("Mirchi ka salan", 50 * R, False)]}]},
            {"name": "Jeera Rice", "price": 160 * R, "diet": "vegan", "tags": [], "spice": 0, "prep": 10,
             "desc": "Basmati tempered with cumin and ghee."},
        ],
    },
    {
        "name": "Breads", "icon": "🫓", "description": "Hot from the tandoor",
        "items": [
            {"name": "Butter Naan", "price": 60 * R, "diet": "veg", "tags": ["bestseller"], "spice": 0, "prep": 6, "desc": "Soft leavened bread brushed with butter."},
            {"name": "Garlic Naan", "price": 70 * R, "diet": "veg", "tags": [], "spice": 0, "prep": 6, "desc": "Naan topped with garlic and coriander."},
            {"name": "Tandoori Roti", "price": 40 * R, "diet": "vegan", "tags": [], "spice": 0, "prep": 5, "desc": "Whole wheat bread from the clay oven."},
            {"name": "Laccha Paratha", "price": 70 * R, "diet": "veg", "tags": [], "spice": 0, "prep": 7, "desc": "Flaky, layered whole wheat paratha."},
        ],
    },
    {
        "name": "Beverages", "icon": "🥤", "description": "Coolers & classics",
        "items": [
            {"name": "Masala Chaas", "price": 80 * R, "diet": "veg", "tags": [], "spice": 0, "prep": 3, "desc": "Spiced buttermilk with roasted cumin and mint."},
            {"name": "Sweet Lassi", "price": 120 * R, "diet": "veg", "tags": ["bestseller"], "spice": 0, "prep": 4, "desc": "Thick Punjabi lassi topped with malai.",
             "groups": [{"name": "Flavour", "min": 1, "max": 1, "options": [("Plain", 0, True), ("Mango", 30 * R, False), ("Rose", 20 * R, False)]}]},
            {"name": "Fresh Lime Soda", "price": 90 * R, "diet": "vegan", "tags": [], "spice": 0, "prep": 3, "desc": "Fizzy and refreshing.",
             "groups": [{"name": "Style", "min": 1, "max": 1, "options": [("Sweet", 0, True), ("Salted", 0, False), ("Mixed", 0, False)]}]},
            {"name": "Cold Coffee", "price": 140 * R, "diet": "veg", "tags": [], "spice": 0, "prep": 5, "desc": "Blended with vanilla ice cream."},
        ],
    },
    {
        "name": "Desserts", "icon": "🍨", "description": "Save room for these",
        "items": [
            {"name": "Gulab Jamun", "price": 90 * R, "diet": "veg", "tags": ["bestseller"], "spice": 0, "prep": 4, "desc": "Two warm milk dumplings in cardamom syrup."},
            {"name": "Rasmalai", "price": 120 * R, "diet": "veg", "tags": [], "spice": 0, "prep": 4, "desc": "Soft chenna discs in saffron milk."},
            {"name": "Sizzling Brownie", "price": 220 * R, "diet": "egg", "tags": ["new"], "spice": 0, "prep": 10, "desc": "Walnut brownie on a hot plate with ice cream and chocolate sauce."},
        ],
    },
]

SAMPLE_TABLES = [
    ("T1", "Indoor", 2), ("T2", "Indoor", 2), ("T3", "Indoor", 4), ("T4", "Indoor", 4), ("T5", "Indoor", 4),
    ("T6", "Indoor", 6), ("T7", "Indoor", 6), ("T8", "Indoor", 8),
    ("R1", "Rooftop", 2), ("R2", "Rooftop", 4), ("R3", "Rooftop", 4), ("R4", "Rooftop", 6),
]


async def add_sample_menu(db: AsyncSession, restaurant: Restaurant) -> list[MenuItem]:
    created: list[MenuItem] = []
    for c_idx, cat in enumerate(SAMPLE_MENU):
        category = MenuCategory(restaurant_id=restaurant.id, name=cat["name"], icon=cat["icon"],
                                description=cat["description"], sort_order=c_idx)
        db.add(category)
        await db.flush()
        for i_idx, it in enumerate(cat["items"]):
            item = MenuItem(
                restaurant_id=restaurant.id, category_id=category.id, name=it["name"], description=it["desc"],
                price=it["price"], diet=it["diet"], tags=it["tags"], spice_level=it["spice"],
                prep_minutes=it["prep"], sort_order=i_idx,
            )
            item.modifier_groups = [
                ModifierGroup(
                    name=g["name"], min_select=g["min"], max_select=g["max"], sort_order=g_idx,
                    options=[ModifierOption(name=n, price_delta=p, is_default=d, sort_order=o_idx)
                             for o_idx, (n, p, d) in enumerate(g["options"])],
                )
                for g_idx, g in enumerate(it.get("groups", []))
            ]
            db.add(item)
            created.append(item)
    await db.flush()
    return created


async def add_sample_tables(
    db: AsyncSession, restaurant: Restaurant, tokens: dict[str, str] | None = None
) -> list[DiningTable]:
    tables = []
    for idx, (label, area, cap) in enumerate(SAMPLE_TABLES):
        t = DiningTable(restaurant_id=restaurant.id, label=label, area=area, capacity=cap,
                        qr_token=(tokens or {}).get(label) or new_qr_token(), sort_order=idx)
        db.add(t)
        tables.append(t)
    await db.flush()
    return tables
