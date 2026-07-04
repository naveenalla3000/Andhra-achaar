# Venkat Ramana Pickles — Technical Requirements Specification (TRS)

## 1. Architecture
```
Expo Mobile (React Native SDK 54)
   │
   ├── Supabase JS (anon key) ── direct CRUD on Postgres (RLS enforced)
   │
   └── FastAPI backend (port 8001, /api/*)
          │
          ├── Verifies Supabase JWT via /auth/v1/user
          └── Uses service_role for cross-user ops (checkout, promote, analytics)
                └── Supabase Postgres
```

## 2. Data Model (Postgres, schema `public`)
Enums: `app_role`, `order_status`
Tables (all with RLS enabled):
- `user_profiles` (supabase_id ↔ auth.users, role, store_id)
- `stores` (name, address, lat, lng, timings, primary_seller_id)
- `pickles` (store_id, name, description, image_url, ingredients, is_active)
- `packaging_options` (pickle_id, label, price_inr, is_active)
- `home_sections` (title, sort_order, is_active)
- `home_section_items` (section_id, pickle_id, sort_order)
- `cart_items` (customer_id, pickle_id, packaging_id, quantity)
- `orders` (customer_id, store_id, status, total_inr, ready_date, timestamps)
- `order_items` (denormalised product snapshot)

Trigger `on_auth_user_created` inserts a `user_profiles` row on every new `auth.users`.

## 3. RLS Highlights
- `stores`, `pickles`, `packaging_options`, `home_sections`, `home_section_items` are public-readable.
- `cart_items`: only own rows.
- `orders`: readable by owner customer, store staff, or admin. Insert restricted to own customer_id; update restricted to store staff / admin.
- Helper SQL functions `current_profile_id()`, `current_role()`, `current_store_id()` power all RLS policies.

## 4. Backend Endpoints (FastAPI, all under `/api`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | none | Healthcheck |
| GET | `/me` | user JWT | Current profile |
| POST | `/admin/promote` | admin JWT | Change role, assign store |
| POST | `/orders/checkout` | customer JWT | Auto-split cart into per-store orders |
| GET | `/analytics/store/{id}` | seller/admin | Metrics for a store |
| GET | `/analytics/admin` | admin | Platform-wide metrics |

## 5. Frontend Structure
```
app/
  index.tsx           role-based redirect
  (auth)/login,signup
  (customer)/         tabs: home, stores, cart, account
  (seller)/           tabs: dashboard, orders, products, account
  (admin)/            tabs: overview, stores, curation, users
  product/[id].tsx    product detail
  store/[id].tsx      store detail
src/lib/
  supabase.ts         client + apiFetch helper
  auth-context.tsx    session + profile provider
  theme.ts            color/spacing/font tokens
```

## 6. Environment Variables
Backend (`/app/backend/.env`): `MONGO_URL`, `DB_NAME`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Frontend (`/app/frontend/.env`): `EXPO_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## 7. Deployment
- Backend: uvicorn/gunicorn on port 8001, all routes prefixed `/api`.
- Frontend: Expo Go for testing; production builds via Emergent Publish button.
- Supabase: run `supabase_schema.sql` once, then promote first admin via SQL.

## 8. Security
- No secret keys in the mobile bundle.
- JWT verified server-side on every backend call.
- RLS is deny-by-default; only explicit policies grant access.
