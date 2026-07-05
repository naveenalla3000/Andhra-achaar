"""Tests for POST /api/profile/heal — self-heal missing user_profiles row.

Verifies:
  * 401 without a bearer token
  * 401 with an invalid bearer token
  * Idempotency: calling /profile/heal for a freshly signed-up user (whose
    row was already created by the DB trigger) returns 200 with the same
    row on both calls.
  * Simulated "row deleted" scenario: use service_role to DELETE the newly
    created user_profiles row, then hit /profile/heal — endpoint must
    re-create the row and return 200 with role='customer'.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://vendor-pickle-hub.preview.emergentagent.com"
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


@pytest.fixture(scope="module")
def fresh_user():
    """Sign up a fresh throwaway user against Supabase auth; return dict with
    access_token + supabase_id. Cleans up user + profile at teardown."""
    email = f"TEST_heal_{uuid.uuid4().hex[:8]}@gmail.com"
    password = "TestPass123!"
    signup = requests.post(
        f"{SUPABASE_URL}/auth/v1/signup",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password, "data": {"full_name": "TEST heal user"}},
        timeout=15,
    )
    assert signup.status_code < 300, f"Signup failed: {signup.status_code} {signup.text}"
    body = signup.json()
    access_token = body.get("access_token")
    user = body.get("user") or {}
    supabase_id = user.get("id")
    if not access_token:
        # Email confirmations enabled → fallback: fetch token via password grant if possible
        pw = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            json={"email": email, "password": password},
            timeout=15,
        )
        if pw.status_code == 200:
            access_token = pw.json().get("access_token")
            supabase_id = pw.json().get("user", {}).get("id")

    if not access_token or not supabase_id:
        pytest.skip("Could not obtain Supabase session — email confirm likely required")

    # Give the DB trigger a moment to insert the profile row
    time.sleep(1.5)

    yield {"email": email, "access_token": access_token, "supabase_id": supabase_id}

    # Cleanup: delete profile row + auth user via service role
    try:
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/user_profiles?supabase_id=eq.{supabase_id}",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            },
            timeout=15,
        )
        requests.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{supabase_id}",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            },
            timeout=15,
        )
    except Exception:
        pass


# ---------- 401 paths ----------
def test_heal_missing_token_returns_401():
    r = requests.post(f"{BASE_URL}/api/profile/heal", timeout=15)
    assert r.status_code == 401
    assert "bearer" in r.json().get("detail", "").lower()


def test_heal_invalid_token_returns_401():
    r = requests.post(
        f"{BASE_URL}/api/profile/heal",
        headers={"Authorization": "Bearer not-a-real-jwt"},
        timeout=15,
    )
    assert r.status_code == 401


# ---------- Happy path / idempotency ----------
def test_heal_idempotent_returns_existing_row(fresh_user):
    r1 = requests.post(
        f"{BASE_URL}/api/profile/heal",
        headers={"Authorization": f"Bearer {fresh_user['access_token']}"},
        timeout=15,
    )
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    assert body1["supabase_id"] == fresh_user["supabase_id"]
    assert body1["role"] == "customer"

    # Call again — must return same row (idempotent)
    r2 = requests.post(
        f"{BASE_URL}/api/profile/heal",
        headers={"Authorization": f"Bearer {fresh_user['access_token']}"},
        timeout=15,
    )
    assert r2.status_code == 200
    assert r2.json()["id"] == body1["id"]


# ---------- Row-missing recovery ----------
def test_heal_recreates_missing_row(fresh_user):
    # Delete the profile row using service_role
    del_r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/user_profiles?supabase_id=eq.{fresh_user['supabase_id']}",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Prefer": "return=representation",
        },
        timeout=15,
    )
    assert del_r.status_code < 300, del_r.text

    # Sanity: row is really gone
    g = requests.get(
        f"{SUPABASE_URL}/rest/v1/user_profiles?supabase_id=eq.{fresh_user['supabase_id']}&select=id",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        timeout=15,
    )
    assert g.status_code == 200 and g.json() == []

    # Now heal it via the backend endpoint
    r = requests.post(
        f"{BASE_URL}/api/profile/heal",
        headers={"Authorization": f"Bearer {fresh_user['access_token']}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    row = r.json()
    assert row["supabase_id"] == fresh_user["supabase_id"]
    assert row["role"] == "customer"
    assert row.get("id")

    # Verify persistence via a direct read
    g2 = requests.get(
        f"{SUPABASE_URL}/rest/v1/user_profiles?supabase_id=eq.{fresh_user['supabase_id']}&select=*",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        timeout=15,
    )
    assert g2.status_code == 200 and len(g2.json()) == 1
    assert g2.json()[0]["id"] == row["id"]
