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

-- Closes a second self-escalation path found in final review: the
-- pre-existing "own profile update" policy lets a user UPDATE their own
-- row but never restricts which columns change, so a customer could set
-- their own role to 'admin' (or store_id to any store) directly via the
-- anon key. RLS has no clean "compare NEW to OLD column" primitive, so
-- this is enforced with a BEFORE UPDATE trigger instead: non-admins may
-- freely update their own row, but not role or store_id. Admins (who
-- reach this table via the same "authenticated" Postgres role, just with
-- role='admin' in the row) are unaffected since the trigger only blocks
-- the change when current_role() != 'admin'.
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'admin' then
    if new.role is distinct from old.role or new.store_id is distinct from old.store_id then
      raise exception 'Only admins can change role or store_id';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_role_escalation on public.user_profiles;
create trigger trg_prevent_self_role_escalation
  before update on public.user_profiles
  for each row execute function public.prevent_self_role_escalation();
