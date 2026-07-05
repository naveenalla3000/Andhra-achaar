from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

app = FastAPI(title="Venkat Ramana Pickles API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------- Supabase helpers ----------
async def sb_admin_request(method: str, path: str, **kwargs) -> httpx.Response:
    headers = kwargs.pop("headers", {})
    headers.update({
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    })
    async with httpx.AsyncClient(timeout=15) as client:
        return await client.request(method, f"{SUPABASE_URL}{path}", headers=headers, **kwargs)


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1]
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired token")
    return r.json()


async def get_current_profile(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    r = await sb_admin_request(
        "GET",
        f"/rest/v1/user_profiles?supabase_id=eq.{user['id']}&select=*",
    )
    if r.status_code != 200 or not r.json():
        raise HTTPException(404, "Profile not found")
    return r.json()[0]


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Venkat Ramana Pickles API", "status": "ok"}


@api_router.get("/me")
async def me(profile: Dict[str, Any] = Depends(get_current_profile)):
    return profile


@api_router.post("/profile/heal")
async def heal_profile(user: Dict[str, Any] = Depends(get_current_user)):
    """Recreate a missing user_profiles row for the current auth user.

    Uses service_role so RLS is bypassed. Safe because the row always
    corresponds to the JWT-verified auth user calling this endpoint.
    Idempotent: on conflict returns the existing row.
    """
    # First, try to find an existing row
    existing = await sb_admin_request(
        "GET",
        f"/rest/v1/user_profiles?supabase_id=eq.{user['id']}&select=*",
    )
    if existing.status_code == 200 and existing.json():
        return existing.json()[0]

    # Not found — create it
    full_name = (user.get("user_metadata") or {}).get("full_name") or user.get("email")
    payload_row = {
        "supabase_id": user["id"],
        "full_name": full_name,
        "role": "customer",
    }
    created = await sb_admin_request("POST", "/rest/v1/user_profiles", json=payload_row)
    if created.status_code >= 300:
        raise HTTPException(500, f"Failed to create profile: {created.text}")
    row = created.json()
    return row[0] if isinstance(row, list) else row


@api_router.post("/admin/promote")
async def promote_user(
    payload: Dict[str, Any],
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Admin-only: change a user's role (and optionally assign a store)."""
    if profile.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    target_supabase_id = payload.get("supabase_id")
    new_role = payload.get("role")
    store_id = payload.get("store_id")
    if not target_supabase_id or new_role not in ("admin", "primary_seller", "sub_seller", "customer"):
        raise HTTPException(400, "Invalid payload")
    update = {"role": new_role}
    if store_id is not None:
        update["store_id"] = store_id
    r = await sb_admin_request(
        "PATCH",
        f"/rest/v1/user_profiles?supabase_id=eq.{target_supabase_id}",
        json=update,
    )
    if r.status_code >= 300:
        raise HTTPException(400, r.text)
    return {"ok": True, "profile": r.json()}


@api_router.post("/orders/checkout")
async def checkout(
    payload: Dict[str, Any],
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Create per-store orders from a customer's cart. Pay at store (no online payment)."""
    if profile["role"] != "customer":
        raise HTTPException(403, "Only customers can checkout")

    # Fetch cart w/ joins via service role (bypasses RLS but we filter to this customer)
    r = await sb_admin_request(
        "GET",
        f"/rest/v1/cart_items?customer_id=eq.{profile['id']}&select=id,quantity,pickle:pickles(id,name,store_id),packaging:packaging_options(id,label,price_inr)",
    )
    if r.status_code != 200:
        raise HTTPException(400, r.text)
    items = r.json()
    if not items:
        raise HTTPException(400, "Cart is empty")

    # Group by store
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for it in items:
        sid = it["pickle"]["store_id"]
        groups.setdefault(sid, []).append(it)

    created_orders = []
    for store_id, its in groups.items():
        total = sum(float(i["packaging"]["price_inr"]) * i["quantity"] for i in its)
        order_res = await sb_admin_request(
            "POST",
            "/rest/v1/orders",
            json={
                "customer_id": profile["id"],
                "store_id": store_id,
                "status": "placed",
                "total_inr": total,
            },
        )
        if order_res.status_code >= 300:
            raise HTTPException(400, order_res.text)
        order = order_res.json()[0]
        rows = [{
            "order_id": order["id"],
            "pickle_id": i["pickle"]["id"],
            "packaging_id": i["packaging"]["id"],
            "pickle_name": i["pickle"]["name"],
            "packaging_label": i["packaging"]["label"],
            "unit_price_inr": i["packaging"]["price_inr"],
            "quantity": i["quantity"],
            "line_total_inr": float(i["packaging"]["price_inr"]) * i["quantity"],
        } for i in its]
        await sb_admin_request("POST", "/rest/v1/order_items", json=rows)
        created_orders.append(order)

    # Clear cart
    await sb_admin_request(
        "DELETE",
        f"/rest/v1/cart_items?customer_id=eq.{profile['id']}",
    )
    return {"orders": created_orders}


@api_router.get("/analytics/store/{store_id}")
async def store_analytics(
    store_id: str,
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Analytics for a store's sellers or admin."""
    if profile["role"] not in ("admin", "primary_seller", "sub_seller"):
        raise HTTPException(403, "Sellers/admin only")
    if profile["role"] != "admin" and profile.get("store_id") != store_id:
        raise HTTPException(403, "Not your store")

    orders_res = await sb_admin_request(
        "GET",
        f"/rest/v1/orders?store_id=eq.{store_id}&select=id,status,total_inr,created_at",
    )
    orders = orders_res.json() if orders_res.status_code == 200 else []
    items_res = await sb_admin_request(
        "GET",
        f"/rest/v1/order_items?order_id=in.({','.join(o['id'] for o in orders) or 'null'})&select=pickle_name,quantity,line_total_inr",
    ) if orders else None
    items = items_res.json() if items_res and items_res.status_code == 200 else []

    total_orders = len(orders)
    total_revenue = sum(float(o["total_inr"]) for o in orders)
    completed = [o for o in orders if o["status"] == "completed"]
    active = [o for o in orders if o["status"] not in ("completed", "cancelled")]

    # Top products
    prod_map: Dict[str, Dict[str, float]] = {}
    for it in items:
        p = prod_map.setdefault(it["pickle_name"], {"qty": 0, "revenue": 0.0})
        p["qty"] += it["quantity"]
        p["revenue"] += float(it["line_total_inr"])
    top_products = sorted(
        [{"name": k, **v} for k, v in prod_map.items()],
        key=lambda x: x["revenue"],
        reverse=True,
    )[:5]

    # Status breakdown
    status_counts: Dict[str, int] = {}
    for o in orders:
        status_counts[o["status"]] = status_counts.get(o["status"], 0) + 1

    return {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "completed_orders": len(completed),
        "active_orders": len(active),
        "top_products": top_products,
        "status_breakdown": status_counts,
    }


@api_router.get("/analytics/admin")
async def admin_analytics(profile: Dict[str, Any] = Depends(get_current_profile)):
    if profile["role"] != "admin":
        raise HTTPException(403, "Admin only")
    stores_res = await sb_admin_request("GET", "/rest/v1/stores?select=id,name,is_active")
    orders_res = await sb_admin_request("GET", "/rest/v1/orders?select=id,status,total_inr,store_id")
    users_res = await sb_admin_request("GET", "/rest/v1/user_profiles?select=id,role")
    stores = stores_res.json() if stores_res.status_code == 200 else []
    orders = orders_res.json() if orders_res.status_code == 200 else []
    users = users_res.json() if users_res.status_code == 200 else []
    return {
        "total_stores": len(stores),
        "active_stores": len([s for s in stores if s["is_active"]]),
        "total_orders": len(orders),
        "total_revenue": sum(float(o["total_inr"]) for o in orders),
        "total_customers": len([u for u in users if u["role"] == "customer"]),
        "total_sellers": len([u for u in users if u["role"] in ("primary_seller", "sub_seller")]),
    }


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
