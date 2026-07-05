# Backend Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire `Andhra-achaar/backend/` (FastAPI) by moving its 5 real endpoints onto Supabase-native mechanisms: Postgres RPC functions for privilege elevation / atomicity, direct RLS-backed `supabase-js` calls everywhere else.

**Architecture:** One new SQL migration adds `heal_profile()`, `checkout()`, `store_analytics()`, `admin_analytics()` as Postgres functions and drops a leftover RLS policy that allowed profile self-promotion. Five frontend call sites swap `apiFetch(...)` / raw `fetch(...)` for `supabase.rpc(...)` or a direct `supabase.from(...)` call. The FastAPI service and its docs references are then deleted.

**Tech Stack:** Supabase (Postgres, RLS, plpgsql), React Native / Expo Router / TypeScript, `@supabase/supabase-js`.

## Global Constraints

- No Supabase Edge Functions — everything here is expressible as a Postgres function or an RLS-scoped direct call (per the approved spec).
- `heal_profile()` must hardcode `role = 'customer'` server-side — never trust a client-supplied role (this is the fix for the self-promotion hole; see spec's "Security issue found in passing").
- `checkout()` must be atomic: partial failure must leave no orphaned `orders` row and must not clear the cart.
- Every RPC function must be granted `execute` to the `authenticated` role explicitly.
- This project has no local Supabase CLI / local Postgres and no automated SQL test harness — migration verification in Task 1 is manual, run against the live project (`jnkdhrgtulruwjlpfxhl`) via the Supabase SQL Editor, per the existing project convention (see root `CLAUDE.md`).
- Frontend has no Jest/RTL suite — verification for frontend tasks is `expo lint` (`yarn lint`) plus `npx tsc --noEmit`, both run from `Andhra-achaar/frontend`.
- Full reference: `docs/superpowers/specs/2026-07-05-backend-retirement-design.md`.

---

### Task 1: Database migration — RPC functions + policy fix

**Files:**
- Create: `Andhra-achaar/supabase_migration_backend_retirement.sql`

**Interfaces:**
- Produces: SQL functions callable via `supabase.rpc(name, args)` from the frontend:
  - `heal_profile()` → returns a `user_profiles` row (jsonb-serialized by PostgREST)
  - `checkout()` → returns `setof orders` (array of order rows)
  - `store_analytics(p_store_id uuid)` → returns `jsonb`
  - `admin_analytics()` → returns `jsonb`
- These names and parameter names (`p_store_id`) are exactly what Tasks 4–6 call — do not rename.

- [ ] **Step 1: Write the migration file**

Create `Andhra-achaar/supabase_migration_backend_retirement.sql` with this exact content:

```sql
-- =====================================================================
-- Migration: retire backend/server.py in favor of Supabase RPC functions.
-- Run once in the Supabase SQL Editor for project jnkdhrgtulruwjlpfxhl.
-- =====================================================================

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
-- order_items, and clears the cart -- all inside the function's implicit
-- transaction, so a failure partway through rolls back everything instead
-- of leaving an orphaned order.
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

- [ ] **Step 2: Apply the migration**

Open the Supabase SQL Editor for project `jnkdhrgtulruwjlpfxhl` and run the full contents of `supabase_migration_backend_retirement.sql`.

Expected: no errors. If `drop policy if exists ...` reports the policy didn't exist, that's fine (idempotent).

- [ ] **Step 3: Verify the policy fix and function existence**

Run in the SQL Editor:

```sql
select policyname from pg_policies where schemaname = 'public' and tablename = 'user_profiles';
```

Expected: rows for `"own profile read"`, `"own profile update"`, `"admin manage profiles"` — **no** `"own profile insert"` row.

```sql
select proname, prosecdef from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('heal_profile', 'checkout', 'store_analytics', 'admin_analytics')
order by proname;
```

Expected: 4 rows. `prosecdef` (security definer flag) is `true` for `heal_profile` only, `false` for the other three.

- [ ] **Step 4: Manually exercise each function as a real user**

In the Supabase Dashboard, open **Authentication → Users**, pick (or create) a test customer account, then in the SQL Editor run, substituting that user's UUID for `<test-uid>`:

```sql
select * from public.user_profiles where supabase_id = '<test-uid>';
```

Confirm a row exists (or is missing, to test heal). You cannot call `auth.uid()`-dependent functions directly from the SQL Editor (it runs as `postgres`, not as the end user), so full functional verification of `heal_profile`/`checkout`/`store_analytics`/`admin_analytics` happens in Task 9's manual app smoke test, once the frontend calls are wired up. This step only confirms the migration applied cleanly and the target rows/tables look as expected.

- [ ] **Step 5: Commit**

```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar
git add supabase_migration_backend_retirement.sql
git commit -m "Add Postgres RPC functions to replace FastAPI backend endpoints

heal_profile, checkout, store_analytics, admin_analytics move the
backend's service-role logic into Postgres functions; also drops the
own-profile-insert policy that allowed client-side role escalation."
```

---

### Task 2: Frontend — `auth-context.tsx` self-heal via RPC

**Files:**
- Modify: `Andhra-achaar/frontend/src/lib/auth-context.tsx:50-82`

**Interfaces:**
- Consumes: `supabase.rpc('heal_profile')` (produced by Task 1) — returns `{ data: Profile | null, error: PostgrestError | null }`.

**Depends on:** Task 1 (the `heal_profile` function must exist in the database before this is exercised end-to-end, though the code change itself compiles independently).

- [ ] **Step 1: Replace the fetch-based self-heal block**

In `Andhra-achaar/frontend/src/lib/auth-context.tsx`, replace lines 50–82:

```tsx
      if (!data) {
        // Self-heal: profile row was deleted but auth.users still exists.
        // Delegate to backend which uses service_role (bypasses RLS) so we
        // don't require an extra RLS policy migration.
        try {
          const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL as string;
          const { data: sessionRes } = await supabase.auth.getSession();
          const token = sessionRes.session?.access_token;
          const res = await fetch(`${backendUrl}/api/profile/heal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });
          if (!res.ok) {
            const errText = await res.text();
            setProfile(null);
            setProfileError(
              `No profile found and self-heal failed: ${errText || res.status}`
            );
            return;
          }
          const healed = await res.json();
          setProfile(healed as Profile);
          setProfileError(null);
          return;
        } catch (healErr: any) {
          setProfile(null);
          setProfileError(healErr?.message || 'Failed to create profile');
          return;
        }
      }
```

with:

```tsx
      if (!data) {
        // Self-heal: profile row was deleted but auth.users still exists.
        // heal_profile() is security definer so it can insert past RLS,
        // and always creates as role='customer' server-side.
        const { data: healed, error: healErr } = await supabase.rpc('heal_profile');
        if (healErr || !healed) {
          setProfile(null);
          setProfileError(
            `No profile found and self-heal failed: ${healErr?.message || 'unknown error'}`
          );
          return;
        }
        setProfile(healed as Profile);
        setProfileError(null);
        return;
      }
```

- [ ] **Step 2: Lint and type-check**

Run:
```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar/frontend
yarn install
yarn lint
npx tsc --noEmit
```
Expected: no new errors from `auth-context.tsx`.

- [ ] **Step 3: Commit**

```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar
git add frontend/src/lib/auth-context.tsx
git commit -m "Replace backend profile-heal fetch with heal_profile RPC call"
```

---

### Task 3: Frontend — `users.tsx` admin promote via direct RLS update

**Files:**
- Modify: `Andhra-achaar/frontend/app/(admin)/users.tsx:5,26-32`

**Interfaces:**
- Consumes: `supabase.from('user_profiles').update(...).eq('supabase_id', ...)` — already permitted by the existing `"admin manage profiles"` RLS policy (`for all ... using (current_role() = 'admin')`). No dependency on Task 1.

- [ ] **Step 1: Drop the `apiFetch` import**

In `Andhra-achaar/frontend/app/(admin)/users.tsx`, change line 5:

```tsx
import { supabase, apiFetch } from '@/src/lib/supabase';
```

to:

```tsx
import { supabase } from '@/src/lib/supabase';
```

- [ ] **Step 2: Replace the `promote` function**

Replace lines 26–32:

```tsx
  const promote = async (role: string, storeId: string | null) => {
    if (!selectedUser) return;
    try {
      await apiFetch('/admin/promote', { method: 'POST', body: JSON.stringify({ supabase_id: selectedUser.supabase_id, role, store_id: storeId }) });
      setSelectedUser(null); load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
```

with:

```tsx
  const promote = async (role: string, storeId: string | null) => {
    if (!selectedUser) return;
    const { error } = await supabase
      .from('user_profiles')
      .update({ role, store_id: storeId })
      .eq('supabase_id', selectedUser.supabase_id);
    if (error) { Alert.alert('Error', error.message); return; }
    setSelectedUser(null); load();
  };
```

- [ ] **Step 3: Lint and type-check**

Run:
```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar/frontend
yarn lint
npx tsc --noEmit
```
Expected: no new errors from `users.tsx`.

- [ ] **Step 4: Commit**

```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar
git add frontend/app/\(admin\)/users.tsx
git commit -m "Replace backend admin/promote call with direct RLS-backed update"
```

---

### Task 4: Frontend — `cart.tsx` checkout via RPC

**Files:**
- Modify: `Andhra-achaar/frontend/app/(customer)/cart.tsx:6,46`

**Interfaces:**
- Consumes: `supabase.rpc('checkout')` (produced by Task 1) — returns `{ data: Order[] | null, error: PostgrestError | null }`. The screen does not read the returned data (matches current behavior, which also discarded the response body).

**Depends on:** Task 1.

- [ ] **Step 1: Drop the `apiFetch` import**

In `Andhra-achaar/frontend/app/(customer)/cart.tsx`, change line 6:

```tsx
import { supabase, apiFetch } from '@/src/lib/supabase';
```

to:

```tsx
import { supabase } from '@/src/lib/supabase';
```

- [ ] **Step 2: Replace the checkout call**

Replace line 46:

```tsx
      await apiFetch('/orders/checkout', { method: 'POST', body: JSON.stringify({}) });
```

with:

```tsx
      const { error } = await supabase.rpc('checkout');
      if (error) throw error;
```

- [ ] **Step 3: Lint and type-check**

Run:
```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar/frontend
yarn lint
npx tsc --noEmit
```
Expected: no new errors from `cart.tsx`.

- [ ] **Step 4: Commit**

```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar
git add frontend/app/\(customer\)/cart.tsx
git commit -m "Replace backend checkout call with atomic checkout RPC"
```

---

### Task 5: Frontend — `dashboard.tsx` (seller analytics) via RPC

**Files:**
- Modify: `Andhra-achaar/frontend/app/(seller)/dashboard.tsx:5,18`

**Interfaces:**
- Consumes: `supabase.rpc('store_analytics', { p_store_id })` (produced by Task 1) — returns `{ data: jsonb | null, error }`. The `jsonb` shape (`total_orders`, `active_orders`, `completed_orders`, `total_revenue`, `top_products`, `status_breakdown`) matches what `data` was already assumed to be, so no other lines in this file need to change.

**Depends on:** Task 1.

- [ ] **Step 1: Swap the import**

In `Andhra-achaar/frontend/app/(seller)/dashboard.tsx`, change line 5:

```tsx
import { apiFetch } from '@/src/lib/supabase';
```

to:

```tsx
import { supabase } from '@/src/lib/supabase';
```

- [ ] **Step 2: Replace the analytics fetch**

Replace line 18:

```tsx
      const d = await apiFetch(`/analytics/store/${profile.store_id}`);
      setData(d);
```

with:

```tsx
      const { data: d, error } = await supabase.rpc('store_analytics', { p_store_id: profile.store_id });
      if (error) throw error;
      setData(d);
```

- [ ] **Step 3: Lint and type-check**

Run:
```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar/frontend
yarn lint
npx tsc --noEmit
```
Expected: no new errors from `dashboard.tsx`.

- [ ] **Step 4: Commit**

```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar
git add frontend/app/\(seller\)/dashboard.tsx
git commit -m "Replace backend store analytics call with store_analytics RPC"
```

---

### Task 6: Frontend — `overview.tsx` (admin analytics) via RPC

**Files:**
- Modify: `Andhra-achaar/frontend/app/(admin)/overview.tsx:5,16`

**Interfaces:**
- Consumes: `supabase.rpc('admin_analytics')` (produced by Task 1) — returns `{ data: jsonb | null, error }`. Shape matches existing `data?.total_stores` etc. usages, no other lines change.

**Depends on:** Task 1.

- [ ] **Step 1: Swap the import**

In `Andhra-achaar/frontend/app/(admin)/overview.tsx`, change line 5:

```tsx
import { apiFetch } from '@/src/lib/supabase';
```

to:

```tsx
import { supabase } from '@/src/lib/supabase';
```

- [ ] **Step 2: Replace the analytics fetch**

Replace line 16:

```tsx
    try { const d = await apiFetch('/analytics/admin'); setData(d); } catch {}
```

with:

```tsx
    const { data: d, error } = await supabase.rpc('admin_analytics');
    if (!error) setData(d);
```

- [ ] **Step 3: Lint and type-check**

Run:
```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar/frontend
yarn lint
npx tsc --noEmit
```
Expected: no new errors from `overview.tsx`.

- [ ] **Step 4: Commit**

```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar
git add frontend/app/\(admin\)/overview.tsx
git commit -m "Replace backend admin analytics call with admin_analytics RPC"
```

---

### Task 7: Frontend — remove `apiFetch`/`BACKEND_URL` from `supabase.ts`

**Files:**
- Modify: `Andhra-achaar/frontend/src/lib/supabase.ts`

**Interfaces:**
- Produces: nothing new — this is a deletion. Confirms no remaining caller depends on `apiFetch`/`BACKEND_URL`.

**Depends on:** Tasks 2–6 (every call site must be migrated off `apiFetch` first, or this breaks the build).

- [ ] **Step 1: Confirm no remaining references**

Run:
```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar/frontend
grep -rn "apiFetch\|BACKEND_URL" app src
```
Expected: only the definitions inside `src/lib/supabase.ts` itself (no call sites left in `app/` or elsewhere in `src/`).

- [ ] **Step 2: Remove `apiFetch` and `BACKEND_URL`**

In `Andhra-achaar/frontend/src/lib/supabase.ts`, remove lines 18–35 (the `BACKEND_URL` export and the whole `apiFetch` function), leaving the file ending after the `createClient` call:

```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});
```

- [ ] **Step 3: Lint and type-check the whole frontend**

Run:
```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar/frontend
yarn lint
npx tsc --noEmit
```
Expected: no errors anywhere in the project (this is the point where a missed call site would surface as `apiFetch is not defined`).

- [ ] **Step 4: Commit**

```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar
git add frontend/src/lib/supabase.ts
git commit -m "Remove apiFetch/BACKEND_URL now that all endpoints are Supabase-native"
```

---

### Task 8: Delete the FastAPI backend

**Files:**
- Delete: `Andhra-achaar/backend/server.py`
- Delete: `Andhra-achaar/backend/requirements.txt`
- Delete: `Andhra-achaar/backend/tests/test_profile_heal.py`

**Interfaces:** None — pure deletion, no other task depends on these files existing.

**Depends on:** Tasks 2–7 (nothing in the frontend should reference the backend anymore).

- [ ] **Step 1: Confirm nothing else references the backend directory**

Run:
```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar
grep -rn "backend/" --include=*.md --include=*.json --include=*.ts --include=*.tsx . 2>/dev/null | grep -v node_modules
```
Expected: only `CLAUDE.md` references remain (handled in Task 9) — no frontend code references.

- [ ] **Step 2: Delete the backend directory**

```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar
git rm -r backend
```

- [ ] **Step 3: Verify it's gone**

```bash
ls Andhra-achaar 2>/dev/null; ls /Users/allanaveen/Developer/aa/Andhra-achaar/backend 2>&1
```
Expected: `ls: .../backend: No such file or directory`.

- [ ] **Step 4: Commit**

```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar
git commit -m "Delete FastAPI backend — fully replaced by Supabase RPC functions"
```

---

### Task 9: Update root `CLAUDE.md`

**Files:**
- Modify: `/Users/allanaveen/Developer/aa/CLAUDE.md`

**Interfaces:** None — documentation only.

**Depends on:** Task 8 (so the doc changes reflect the final state).

- [ ] **Step 1: Remove the Backend commands section**

In `/Users/allanaveen/Developer/aa/CLAUDE.md`, delete this block from `## Commands`:

```markdown
### Backend (FastAPI / Python)
```bash
cd Andhra-achaar/backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8000   # Dev server

# Tests
pytest tests/
pytest tests/test_profile_heal.py        # Single test file
```
```

- [ ] **Step 2: Remove the backend env var block and `EXPO_PUBLIC_BACKEND_URL`**

Replace:

```markdown
## Environment Variables

**Frontend** — create `Andhra-achaar/frontend/.env`:
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_BACKEND_URL=
```

**Backend** — create `Andhra-achaar/backend/.env`:
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
```

with:

```markdown
## Environment Variables

**Frontend** — create `Andhra-achaar/frontend/.env`:
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```
```

- [ ] **Step 3: Replace the "Backend API Layer" architecture note**

Replace:

```markdown
### Backend API Layer
The backend (`backend/server.py`) exists primarily for operations that require `service_role` (bypassing RLS): checkout, profile heal, admin promote. All other reads/writes go direct from the frontend to Supabase via the anon key with RLS.

`apiFetch()` in `src/lib/supabase.ts` is the frontend helper — it automatically attaches the current Supabase JWT as `Authorization: Bearer`.
```

with:

```markdown
### Database RPC Functions
There is no backend service — every operation goes direct from the frontend to Supabase via the anon key, either through RLS-scoped `supabase.from()` calls or through Postgres functions (`supabase_migration_backend_retirement.sql`) for anything needing privilege elevation or a real transaction:
- `heal_profile()` — `security definer`; recreates a missing `user_profiles` row, always as `role = 'customer'`
- `checkout()` — atomic: splits the cart into per-store orders + order_items and clears the cart in one transaction
- `store_analytics(p_store_id)` / `admin_analytics()` — server-side aggregation for the seller dashboard / admin overview
```

- [ ] **Step 4: Update the Auth Flow paragraph**

Replace:

```markdown
### Auth Flow
`AuthProvider` (`src/lib/auth-context.tsx`) wraps the whole app. On session start it loads the `user_profiles` row from Supabase directly. If the row is missing (e.g. trigger failed at signup), it calls `POST /api/profile/heal` on the backend — which uses `service_role` to bypass RLS and recreate the row.
```

with:

```markdown
### Auth Flow
`AuthProvider` (`src/lib/auth-context.tsx`) wraps the whole app. On session start it loads the `user_profiles` row from Supabase directly. If the row is missing (e.g. trigger failed at signup), it calls `supabase.rpc('heal_profile')` — a `security definer` Postgres function that bypasses RLS and recreates the row.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/allanaveen/Developer/aa
git add CLAUDE.md
git commit -m "Update CLAUDE.md: backend retired, document RPC functions"
```

---

### Task 10: End-to-end manual smoke test

**Files:** None (verification only).

**Depends on:** Tasks 1–9 complete, migration applied to the live Supabase project, `EXPO_PUBLIC_BACKEND_URL` removed from any local `.env`.

- [ ] **Step 1: Start the app**

```bash
cd /Users/allanaveen/Developer/aa/Andhra-achaar/frontend
yarn install
yarn ios   # or: yarn android / yarn web
```

- [ ] **Step 2: Profile self-heal**

In the Supabase Dashboard, delete a test user's `user_profiles` row (keep their `auth.users` row). Log into the app as that user. Expected: no error screen; a new `user_profiles` row appears with `role = 'customer'`.

- [ ] **Step 3: Admin promote**

Log in as an admin, go to Users, select a customer, assign `primary_seller` + a store. Expected: the update succeeds, the list refreshes showing the new role/store, and `user_profiles.role`/`store_id` are updated in the database.

- [ ] **Step 4: Checkout**

Log in as a customer with items from two different stores in the cart. Tap checkout. Expected: "Order placed" alert, cart is empty afterward, and exactly one `orders` row per store was created with matching `order_items`.

- [ ] **Step 5: Seller + admin analytics**

Log in as a seller assigned to a store with existing orders — confirm the dashboard shows non-zero totals and a top-products list. Log in as admin — confirm the overview screen shows platform-wide totals.

- [ ] **Step 6: Confirm no dangling backend references**

```bash
cd /Users/allanaveen/Developer/aa
grep -rn "EXPO_PUBLIC_BACKEND_URL\|backend/server.py\|uvicorn" --include=*.md --include=*.ts --include=*.tsx . 2>/dev/null | grep -v node_modules
```
Expected: no output.

This task has no code changes to commit — it's the final verification gate before considering the migration complete.
