"""End-to-end flows through the real app (SQLite temp DB, mock payments, console WhatsApp).

Run: .venv/bin/python -m pytest -q
"""

import os
import tempfile
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db}"
os.environ["SCHEDULER_INTERVAL_SECONDS"] = "3600"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.schemas.restaurant import RestaurantSettings, TaxRule  # noqa: E402
from app.services.pricing import compute_totals  # noqa: E402

API = "/api/v1"
IST = ZoneInfo("Asia/Kolkata")


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def owner(client):
    r = client.post(f"{API}/auth/login", json={"email": "owner@demo.dineos.example", "password": "demo1234"})
    assert r.status_code == 200, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    # make the demo restaurant open 24h so the tests don't depend on wall-clock time
    s = client.patch(f"{API}/restaurant/settings", json={"opening_time": "00:00", "closing_time": "00:00"},
                     headers=headers)
    assert s.status_code == 200, s.text
    return headers


def _menu(client):
    menu = client.get(f"{API}/public/restaurants/spice-garden/menu").json()
    return {i["name"]: i for c in menu["categories"] for i in c["items"]}


def test_pricing_exclusive_and_inclusive():
    s = RestaurantSettings(taxes=[TaxRule(name="CGST", rate=2.5), TaxRule(name="SGST", rate=2.5)])
    t = compute_totals(100_00, s)
    assert t.tax_total == 5_00 and t.total == 105_00
    t = compute_totals(99_90, s)  # 104.895 -> rounded to 105
    assert t.total == 105_00 and t.round_off == 5_00 * 0 + (105_00 - (99_90 + t.tax_total))
    s_incl = RestaurantSettings(prices_include_tax=True, round_off=False)
    t = compute_totals(105_00, s_incl)
    assert t.total == 105_00 and t.tax_total == 5_00 and sum(x["amount"] for x in t.taxes) == 5_00
    t = compute_totals(1000_00, RestaurantSettings(service_charge_percent=10), discount=100_00)
    assert t.service_charge == 90_00 and t.tax_total == round((900_00 + 90_00) * 0.05)


def test_dine_in_qr_to_counter_payment(client, owner):
    lookup = client.get(f"{API}/public/tables/demo-t1")
    assert lookup.status_code == 200, lookup.text
    assert lookup.json()["table"]["label"] == "T1"

    joined = client.post(f"{API}/public/tables/demo-t1/session", json={"guest_name": "Asha", "guest_count": 2}).json()
    guest = {"X-Guest-Token": joined["token"]}
    # second phone at the same table joins the same session
    second = client.post(f"{API}/public/tables/demo-t1/session", json={}).json()
    assert second["session"]["id"] == joined["session"]["id"]

    items = _menu(client)
    tikka = items["Paneer Tikka"]
    full = next(o for g in tikka["modifier_groups"] for o in g["options"] if o["name"] == "Full")
    payload = {"client_order_id": "test-round-1", "items": [
        {"menu_item_id": tikka["id"], "quantity": 1, "option_ids": [full["id"]]},
        {"menu_item_id": items["Butter Naan"]["id"], "quantity": 2},
    ]}
    # missing required option is rejected
    bad = client.post(f"{API}/public/sessions/me/orders", headers=guest,
                      json={"items": [{"menu_item_id": tikka["id"], "quantity": 1}]})
    assert bad.status_code == 422
    r1 = client.post(f"{API}/public/sessions/me/orders", headers=guest, json=payload)
    assert r1.status_code == 201, r1.text
    order = r1.json()
    assert order["subtotal"] == (280_00 + 120_00) + 2 * 60_00
    # idempotent retry (double tap on bad network)
    r2 = client.post(f"{API}/public/sessions/me/orders", headers=guest, json=payload)
    assert r2.json()["id"] == order["id"]

    active = client.get(f"{API}/orders", params={"active": True}, headers=owner).json()
    assert any(o["id"] == order["id"] for o in active)

    for status in ("preparing", "ready", "served"):
        res = client.patch(f"{API}/orders/{order['id']}/status", json={"status": status}, headers=owner)
        assert res.status_code == 200, res.text
    illegal = client.patch(f"{API}/orders/{order['id']}/status", json={"status": "preparing"}, headers=owner)
    assert illegal.status_code == 409

    req = client.post(f"{API}/public/sessions/me/requests", headers=guest, json={"kind": "water"})
    assert req.status_code == 201

    bill = client.post(f"{API}/public/sessions/me/bill", headers=guest).json()
    assert bill["subtotal"] == 520_00 and bill["tax_total"] == 26_00 and bill["total"] == 546_00

    checkout = client.post(f"{API}/public/bills/{bill['id']}/pay", headers=guest,
                           json={"mode": "counter", "customer_phone": "5550009876"}).json()
    assert checkout["mode"] == "counter"
    queue = client.get(f"{API}/bills", params={"counter": True}, headers=owner).json()
    assert any(b["id"] == bill["id"] for b in queue)

    live = client.get(f"{API}/tables/live", headers=owner).json()
    t1 = next(t for t in live if t["table"]["label"] == "T1")
    assert t1["state"] in ("attention", "awaiting_counter")

    short = client.post(f"{API}/bills/{bill['id']}/collect", json={"method": "cash", "tendered": 500_00},
                        headers=owner)
    assert short.status_code == 422
    paid = client.post(f"{API}/bills/{bill['id']}/collect", json={"method": "cash", "tendered": 600_00},
                       headers=owner).json()
    assert paid["status"] == "paid" and paid["invoice_number"].startswith("SG/")
    assert paid["payments"][-1]["change_due"] == 54_00

    me = client.get(f"{API}/public/sessions/me", headers=guest).json()
    assert me["session"]["status"] == "closed" and me["bill"]["invoice_url"]
    pdf = client.get(me["bill"]["invoice_url"].replace("http://localhost:8000", ""))
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"

    wa = client.post(f"{API}/public/bills/{bill['id']}/whatsapp", headers=guest, json={"phone": "5550009876"}).json()
    assert wa["simulated"] and wa["share_url"].startswith("https://wa.me/915550009876")
    fb = client.post(f"{API}/public/bills/{bill['id']}/feedback", headers=guest, json={"rating": 5, "comment": "Yum"})
    assert fb.status_code == 201
    closed = client.post(f"{API}/public/sessions/me/orders", headers=guest, json={"items": payload["items"]})
    assert closed.status_code == 410


def test_takeaway_online_payment(client, owner):
    items = _menu(client)
    biryani = items["Hyderabadi Chicken Dum Biryani"]
    regular = next(o for g in biryani["modifier_groups"] if g["name"] == "Size" for o in g["options"]
                   if o["name"] == "Regular")
    res = client.post(f"{API}/public/restaurants/spice-garden/orders", json={
        "order_type": "takeaway", "customer_name": "Dev", "customer_phone": "9000000001", "pay_mode": "online",
        "items": [{"menu_item_id": biryani["id"], "quantity": 2, "option_ids": [regular["id"]]}],
    })
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["order"]["status"] == "pending_payment" and data["checkout"]["provider"] == "mock"
    guest = {"X-Guest-Token": data["token"]}
    done = client.post(f"{API}/public/payments/{data['checkout']['payment_id']}/mock-complete", headers=guest,
                       json={"success": True, "method": "upi"}).json()
    assert done["status"] == "paid"
    track = client.get(f"{API}/public/orders/me", headers=guest).json()
    assert track["order"]["status"] in ("placed", "preparing") and track["bill"]["payment_method"] == "upi"


def test_delivery_minimum_order(client, owner):
    items = _menu(client)
    res = client.post(f"{API}/public/restaurants/spice-garden/orders", json={
        "order_type": "delivery", "customer_name": "Dev", "customer_phone": "9000000001", "pay_mode": "counter",
        "delivery_address": {"line1": "221B Baker Street"},
        "items": [{"menu_item_id": items["Tandoori Roti"]["id"], "quantity": 1}],
    })
    assert res.status_code == 422


def test_reservation_with_preorder(client, owner):
    tomorrow = (datetime.now(IST) + timedelta(days=1)).date()
    slots = client.get(f"{API}/public/restaurants/spice-garden/slots",
                       params={"date": tomorrow.isoformat(), "party_size": 4}).json()
    slot = next(s for s in slots if s["available"])
    items = _menu(client)
    res = client.post(f"{API}/public/restaurants/spice-garden/reservations", json={
        "customer_name": "Riya", "customer_phone": "9123456780", "party_size": 4, "reserved_for": slot["time"],
        "occasion": "Birthday",
        "preorder_items": [{"menu_item_id": items["Dal Makhani"]["id"], "quantity": 1}],
    })
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["reservation"]["status"] == "confirmed" and data["preorder"]["status"] == "scheduled"
    guest = {"X-Guest-Token": data["token"]}
    onway = client.post(f"{API}/public/reservations/me/on-my-way", headers=guest).json()
    assert onway["preorder"]["status"] in ("placed", "preparing")

    tables = client.get(f"{API}/tables", headers=owner).json()
    t5 = next(t for t in tables if t["label"] == "T5")
    seated = client.post(f"{API}/reservations/{data['reservation']['id']}/seat", json={"table_id": t5["id"]},
                         headers=owner).json()
    assert seated["reservation"]["status"] == "seated" and seated["table_label"] == "T5"
    session = client.get(f"{API}/sessions/{seated['reservation']['session_id']}", headers=owner).json()
    assert any(o["id"] == data["preorder"]["id"] for o in session["orders"])


def test_staff_websocket_receives_new_orders(client, owner):
    token = owner["Authorization"].split()[1]
    joined = client.post(f"{API}/public/tables/demo-t2/session", json={"guest_count": 2}).json()
    items = _menu(client)
    with client.websocket_connect(f"/ws/staff?token={token}") as ws:
        assert ws.receive_json()["type"] == "hello"
        client.post(f"{API}/public/sessions/me/orders", headers={"X-Guest-Token": joined["token"]},
                    json={"items": [{"menu_item_id": items["Gulab Jamun"]["id"], "quantity": 2}]})
        types = {ws.receive_json()["type"] for _ in range(2)}
        assert "order.created" in types


def test_analytics_and_onboarding(client, owner):
    summary = client.get(f"{API}/analytics/summary", params={"days": 7}, headers=owner).json()
    assert summary["kpis"]["revenue"] > 0 and len(summary["daily"]) == 7 and summary["top_items"]
    steps = client.get(f"{API}/restaurant/onboarding", headers=owner).json()
    assert {s["key"] for s in steps} >= {"menu", "tables", "first_payment"}


def test_role_guard(client):
    r = client.post(f"{API}/auth/login", json={"email": "kitchen@demo.dineos.example", "password": "demo1234"})
    kitchen = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get(f"{API}/staff", headers=kitchen).status_code == 403
    assert client.get(f"{API}/orders", params={"active": True}, headers=kitchen).status_code == 200


def test_signup_creates_sample_restaurant(client):
    r = client.post(f"{API}/auth/signup", json={
        "restaurant_name": "Cafe Mocha", "owner_name": "Sam", "email": "sam@example.com", "password": "password123"})
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    menu = client.get(f"{API}/menu", headers=headers).json()
    assert len(menu["categories"]) >= 5
    sheet = client.get(f"{API}/tables-qr-sheet.pdf", headers=headers)
    assert sheet.status_code == 200 and sheet.content[:4] == b"%PDF"
