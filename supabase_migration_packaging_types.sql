-- =====================================================================
-- Migration: packaging_types + variant_packagings
-- Run ONCE in Supabase SQL Editor — project jnkdhrgtulruwjlpfxhl
-- =====================================================================

-- 1. Admin-managed global catalog
create table if not exists public.packaging_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- 2. Size-variant × packaging-type = priced SKU
create table if not exists public.variant_packagings (
  id                uuid primary key default gen_random_uuid(),
  variant_id        uuid not null references public.prickel_varients(id) on delete cascade,
  packaging_type_id uuid not null references public.packaging_types(id),
  packaging_cost    numeric(10,2) not null default 0,
  mrp_inr           numeric(10,2) not null,
  selling_price_inr numeric(10,2) not null,
  discount_pct      numeric(5,2) not null default 0,
  stock             int not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (variant_id, packaging_type_id)
);

-- 3. Give old variant price columns safe defaults (pricing now lives in variant_packagings)
alter table public.prickel_varients
  alter column mrp_inr         set default 0,
  alter column selling_price_inr set default 0,
  alter column discount_pct    set default 0,
  alter column stock           set default 0;

-- 4. cart_items: swap variant_id → variant_packaging_id
alter table public.cart_items
  drop column if exists variant_id cascade;

alter table public.cart_items
  add column if not exists variant_packaging_id uuid
    references public.variant_packagings(id) on delete cascade;

alter table public.cart_items
  drop constraint if exists cart_items_customer_id_pickle_id_variant_id_key,
  drop constraint if exists cart_items_customer_id_pickle_id_key,
  drop constraint if exists cart_items_customer_id_pickle_id_variant_packaging_id_key;

alter table public.cart_items
  add constraint cart_items_customer_id_pickle_id_variant_packaging_id_key
  unique (customer_id, pickle_id, variant_packaging_id);

-- 5. order_items: add packaging columns (variant_label may already exist from backend-retirement migration)
alter table public.order_items
  add column if not exists variant_label        text,
  add column if not exists packaging_type_name  text;

-- 6. RLS
alter table public.packaging_types     enable row level security;
alter table public.variant_packagings  enable row level security;

drop policy if exists "read packaging_types"          on public.packaging_types;
drop policy if exists "admin manages packaging_types"  on public.packaging_types;
drop policy if exists "read variant_packagings"        on public.variant_packagings;
drop policy if exists "sellers manage variant_packagings" on public.variant_packagings;

create policy "read packaging_types"
  on public.packaging_types for select to authenticated
  using (true);

create policy "admin manages packaging_types"
  on public.packaging_types for all to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

create policy "read variant_packagings"
  on public.variant_packagings for select to authenticated
  using (true);

create policy "sellers manage variant_packagings"
  on public.variant_packagings for all to authenticated
  using (
    public.current_role() = 'admin'
    or (
      public.current_role() = 'primary_seller'
      and exists (
        select 1 from public.prickel_varients pv
        join public.pickles p on p.id = pv.pickle_id
        where pv.id = variant_packagings.variant_id
          and p.store_id = public.current_store_id()
      )
    )
  )
  with check (
    public.current_role() = 'admin'
    or (
      public.current_role() = 'primary_seller'
      and exists (
        select 1 from public.prickel_varients pv
        join public.pickles p on p.id = pv.pickle_id
        where pv.id = variant_packagings.variant_id
          and p.store_id = public.current_store_id()
      )
    )
  );

-- 7. Recreate checkout() — prices from variant_packagings
create or replace function public.checkout()
returns setof public.orders
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer uuid := public.current_profile_id();
  v_store    uuid;
  v_order    public.orders;
begin
  if v_customer is null then
    raise exception 'No profile for current user';
  end if;

  if not exists (
    select 1 from public.cart_items where customer_id = v_customer
  ) then
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
      sum(vp.selling_price_inr * c.quantity)
    from public.cart_items c
    join public.pickles p on p.id = c.pickle_id
    join public.variant_packagings vp on vp.id = c.variant_packaging_id
    where c.customer_id = v_customer and p.store_id = v_store
    returning * into v_order;

    insert into public.order_items
      (order_id, pickle_id, pickle_name, variant_label, packaging_type_name,
       unit_price_inr, quantity, line_total_inr)
    select
      v_order.id, p.id, p.name, pv.label, pt.name,
      vp.selling_price_inr, c.quantity, vp.selling_price_inr * c.quantity
    from public.cart_items c
    join public.pickles p on p.id = c.pickle_id
    join public.variant_packagings vp on vp.id = c.variant_packaging_id
    join public.prickel_varients pv on pv.id = vp.variant_id
    join public.packaging_types pt on pt.id = vp.packaging_type_id
    where c.customer_id = v_customer and p.store_id = v_store;

    return next v_order;
  end loop;

  delete from public.cart_items where customer_id = v_customer;
end;
$$;

grant execute on function public.checkout() to authenticated;
