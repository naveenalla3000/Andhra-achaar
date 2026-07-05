# Backend Retirement: Migrate FastAPI to Supabase

## Goal

Retire `Andhra-achaar/backend/` (FastAPI service) entirely. Move its 5 real
endpoints onto Supabase-native mechanisms — Postgres RPC functions where
privilege elevation or a real transaction is required, and direct
RLS-backed `supabase-js` calls everywhere else. No Supabase Edge Functions:
nothing here needs a runtime outside Postgres (no external HTTP calls,
email, cron, etc.), so an Edge Function would just be an extra network hop
to reach the same database a Postgres function can reach directly.

## Current State

`backend/server.py` (272 lines) exposes 7 endpoints under `/api`, all
proxying to Postgres REST using the `service_role` key (bypassing RLS) so
the FastAPI layer can enforce its own authorization:

| Endpoint | Used by (frontend) | Needs |
|---|---|---|
| `GET /` | nothing | — (health check, drop) |
| `GET /me` | nothing | — (drop) |
| `POST /profile/heal` | `auth-context.tsx` | insert own profile row before it exists |
| `POST /admin/promote` | `(admin)/users.tsx` | admin updates another user's role/store |
| `POST /orders/checkout` | `(customer)/cart.tsx` | multi-table write, currently **not atomic** |
| `GET /analytics/store/{id}` | `(seller)/dashboard.tsx` | aggregation, scoped to caller's store |
| `GET /analytics/admin` | `(admin)/overview.tsx` | aggregation, admin only |

Existing RLS (`supabase_schema.sql`) already covers more of this than the
backend assumes:
- `"admin manage profiles"` (`for all`, `using (current_role() = 'admin')`)
  already permits an admin to `UPDATE` any `user_profiles` row — `/admin/promote`
  needs no new backend logic at all.
- Order/order_items `select` policies already scope correctly to
  `customer_id`, `store_id`, or admin — read aggregation can run as the
  caller (`security invoker`) and inherit that scoping.

**Security issue found in passing:** `supabase_migration_profile_heal.sql`
added `"own profile insert"` (`with check (supabase_id = auth.uid())`) —
this checks *only* `supabase_id`, not `role`, so any authenticated user can
currently insert themselves with `role = 'admin'` directly via the anon
key. This migration closes that hole by dropping the policy and replacing
the only legitimate use case (self-healing a missing profile) with a
`security definer` function that hardcodes `role = 'customer'`.

## Design

### 1. Database migration

New file: `supabase_migration_backend_retirement.sql`.

```sql
-- Close a privilege-escalation hole: authenticated users could previously
-- insert their own user_profiles row with any role (e.g. 'admin') because
-- the insert policy only checked supabase_id, not role.
drop policy if exists "own profile insert" on public.user_profiles;

-- Recreates a missing profile row for the calling auth user. Idempotent:
-- returns the existing row if one is already there. Always creates as
-- 'customer' regardless of caller input, closing the escalation path the
-- old "own profile insert" policy left open.
create or replace function public.heal_profile()
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_profiles;
begin
  select * into v_row from public.user_profiles where supabase_id = v_uid;
  if found then
    return v_row;
  end if;

  insert into public.user_profiles (supabase_id, full_name, role)
  select v_uid, coalesce(u.raw_user_meta_data->>'full_name', u.email), 'customer'::app_role
  from auth.users u where u.id = v_uid
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.heal_profile() to authenticated;

-- Splits the calling customer's cart into one order per store, inserts
-- order_items, and clears the cart -- all in one transaction (the
-- function body), so a failure partway through rolls back everything
-- instead of leaving an orphaned order (the old FastAPI endpoint did not
-- guarantee this).
create or replace function public.checkout()
returns setof public.orders
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer uuid := public.current_profile_id();
  v_store uuid;
  v_order public.orders;
begin
  if v_customer is null then
    raise exception 'No profile for current user';
  end if;

  if not exists (select 1 from public.cart_items where customer_id = v_customer) then
    raise exception 'Cart is empty';
  end if;

  for v_store in
    select distinct p.store_id
    from public.cart_items c
    join public.pickles p on p.id = c.pickle_id
    where c.customer_id = v_customer
  loop
    insert into public.orders (customer_id, store_id, status, total_inr)
    select v_customer, v_store, 'placed',
      sum(pk.price_inr * c.quantity)
    from public.cart_items c
    join public.pickles p on p.id = c.pickle_id
    join public.packaging_options pk on pk.id = c.packaging_id
    where c.customer_id = v_customer and p.store_id = v_store
    returning * into v_order;

    insert into public.order_items
      (order_id, pickle_id, packaging_id, pickle_name, packaging_label,
       unit_price_inr, quantity, line_total_inr)
    select v_order.id, p.id, pk.id, p.name, pk.label, pk.price_inr,
      c.quantity, pk.price_inr * c.quantity
    from public.cart_items c
    join public.pickles p on p.id = c.pickle_id
    join public.packaging_options pk on pk.id = c.packaging_id
    where c.customer_id = v_customer and p.store_id = v_store;

    return next v_order;
  end loop;

  delete from public.cart_items where customer_id = v_customer;
end;
$$;
grant execute on function public.checkout() to authenticated;

-- Analytics for one store's sellers or admin. Mirrors the authorization
-- the old /analytics/store/{id} endpoint enforced explicitly, rather than
-- relying on RLS to silently return an empty set for the wrong caller.
create or replace function public.store_analytics(p_store_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role app_role := public.current_role();
begin
  if v_role not in ('admin', 'primary_seller', 'sub_seller') then
    raise exception 'Sellers/admin only';
  end if;
  if v_role != 'admin' and public.current_store_id() != p_store_id then
    raise exception 'Not your store';
  end if;

  return (
    with o as (
      select id, status, total_inr from public.orders where store_id = p_store_id
    ), i as (
      select oi.pickle_name, oi.quantity, oi.line_total_inr
      from public.order_items oi join o on o.id = oi.order_id
    ), top as (
      select pickle_name as name, sum(quantity) as qty, sum(line_total_inr) as revenue
      from i group by pickle_name order by revenue desc limit 5
    )
    select jsonb_build_object(
      'total_orders', (select count(*) from o),
      'total_revenue', coalesce((select sum(total_inr) from o), 0),
      'completed_orders', (select count(*) from o where status = 'completed'),
      'active_orders', (select count(*) from o where status not in ('completed', 'cancelled')),
      'top_products', coalesce((select jsonb_agg(top) from top), '[]'::jsonb),
      'status_breakdown', coalesce(
        (select jsonb_object_agg(status, cnt) from (
          select status, count(*) cnt from o group by status
        ) s), '{}'::jsonb
      )
    )
  );
end;
$$;
grant execute on function public.store_analytics(uuid) to authenticated;

-- Admin-only platform-wide analytics. Mirrors /analytics/admin.
create or replace function public.admin_analytics()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_role() != 'admin' then
    raise exception 'Admin only';
  end if;

  return jsonb_build_object(
    'total_stores', (select count(*) from public.stores),
    'active_stores', (select count(*) from public.stores where is_active),
    'total_orders', (select count(*) from public.orders),
    'total_revenue', coalesce((select sum(total_inr) from public.orders), 0),
    'total_customers', (select count(*) from public.user_profiles where role = 'customer'),
    'total_sellers', (select count(*) from public.user_profiles where role in ('primary_seller', 'sub_seller'))
  );
end;
$$;
grant execute on function public.admin_analytics() to authenticated;
```

### 2. Frontend changes

- `src/lib/auth-context.tsx`: replace the `fetch(`${backendUrl}/api/profile/heal`)`
  call with `await supabase.rpc('heal_profile')`.
- `app/(admin)/users.tsx`: replace `apiFetch('/admin/promote', ...)` with
  `await supabase.from('user_profiles').update({ role, store_id: storeId }).eq('supabase_id', selectedUser.supabase_id)`.
- `app/(customer)/cart.tsx`: replace `apiFetch('/orders/checkout', ...)` with
  `await supabase.rpc('checkout')`.
- `app/(seller)/dashboard.tsx`: replace `apiFetch(`/analytics/store/${profile.store_id}`)`
  with `await supabase.rpc('store_analytics', { p_store_id: profile.store_id })`.
- `app/(admin)/overview.tsx`: replace `apiFetch('/analytics/admin')` with
  `await supabase.rpc('admin_analytics')`.
- `src/lib/supabase.ts`: remove `apiFetch()` and `BACKEND_URL`.

**Amendment:** `EXPO_PUBLIC_BACKEND_URL` is kept, not removed — `app/(auth)/forgot-password.tsx`
uses it for an unrelated purpose (the Supabase password-reset redirect,
`${backendUrl}/reset-password`, a separately-hosted static page, not part of
`backend/server.py`). Discovered mid-implementation and confirmed with the
project owner; the plan document was corrected accordingly (see its Task 9
Step 2 note).

The two analytics RPCs return `jsonb_build_object` shapes whose keys mirror
the old FastAPI response dicts exactly, so the dashboard/overview screens
don't need to change how they read the response — only how they fetch it.
`checkout()` returns `setof orders` (a bare array of order rows via
`supabase.rpc`), not the old `{ orders: [...] }` wrapper — but `cart.tsx`
awaits the call today without reading its return value, so this is a
non-issue in practice.

### 3. Retirement

- Delete `Andhra-achaar/backend/` (`server.py`, `requirements.txt`, `tests/test_profile_heal.py`).
- Update root `CLAUDE.md`:
  - Remove the "Backend (FastAPI / Python)" commands section.
  - Remove the backend `.env` block under Environment Variables.
    `EXPO_PUBLIC_BACKEND_URL` stays in the frontend block (see amendment above).
  - Replace the "Backend API Layer" architecture note with a description
    of the RPC functions (`heal_profile`, `checkout`, `store_analytics`,
    `admin_analytics`) and where they live (`supabase_migration_backend_retirement.sql`).
  - Update the Auth Flow paragraph: profile healing now calls
    `supabase.rpc('heal_profile')` directly, no backend involved.

## Error Handling

RPC calls raise Postgres exceptions (`raise exception '...'`) for
authorization failures (`Sellers/admin only`, `Not your store`, `Admin only`,
`Cart is empty`) — `supabase-js` surfaces these as `error.message` on the
`{ data, error }` result, same shape the frontend already handles for other
`supabase.from()` calls. No new error-handling pattern needed on the client.

## Testing

- `backend/tests/test_profile_heal.py` is deleted along with the backend;
  there is no equivalent Postgres/pgTAP test harness in this project today,
  and adding one is out of scope for this migration.
- Manual verification plan (post-implementation): sign up a fresh user and
  confirm `heal_profile` fires correctly if the trigger-created row is
  missing; run a checkout with items from two different stores and confirm
  two orders + cleared cart; promote a user via the admin UI; load seller
  and admin analytics screens.

## Out of Scope

- `GET /` and `GET /me` are dropped — unused by the frontend.
- No Edge Functions are introduced.
- No changes to the `handle_new_user` trigger (still the primary path for
  profile creation; `heal_profile` is only the fallback).
