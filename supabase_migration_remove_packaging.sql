-- =====================================================================
-- Migration: remove packaging_options — price now lives on pickles.
-- Run ONCE in the Supabase SQL Editor for project jnkdhrgtulruwjlpfxhl.
-- =====================================================================

-- 1. Add price_inr directly on pickles
alter table public.pickles
  add column if not exists price_inr numeric(10,2) not null default 0;

-- 2. Seed from cheapest active packaging option (for existing data)
update public.pickles p
set price_inr = (
  select min(po.price_inr)
  from public.packaging_options po
  where po.pickle_id = p.id
)
where exists (
  select 1 from public.packaging_options po where po.pickle_id = p.id
);

-- 3. cart_items: drop packaging_id (cascade removes the FK + composite unique)
alter table public.cart_items
  drop column if exists packaging_id cascade;

-- new unique: one row per (customer, pickle)
alter table public.cart_items
  drop constraint if exists cart_items_customer_id_pickle_id_key;
alter table public.cart_items
  add constraint cart_items_customer_id_pickle_id_key unique (customer_id, pickle_id);

-- 4. order_items: drop packaging columns (cascade removes FKs)
alter table public.order_items
  drop column if exists packaging_id cascade,
  drop column if exists packaging_label cascade;

-- 5. Drop packaging_options table (all FKs already removed above)
drop table if exists public.packaging_options;

-- 6. Recreate checkout() without packaging references
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
      sum(p.price_inr * c.quantity)
    from public.cart_items c
    join public.pickles p on p.id = c.pickle_id
    where c.customer_id = v_customer and p.store_id = v_store
    returning * into v_order;

    insert into public.order_items
      (order_id, pickle_id, pickle_name, unit_price_inr, quantity, line_total_inr)
    select v_order.id, p.id, p.name, p.price_inr,
      c.quantity, p.price_inr * c.quantity
    from public.cart_items c
    join public.pickles p on p.id = c.pickle_id
    where c.customer_id = v_customer and p.store_id = v_store;

    return next v_order;
  end loop;

  delete from public.cart_items where customer_id = v_customer;
end;
$$;
grant execute on function public.checkout() to authenticated;
