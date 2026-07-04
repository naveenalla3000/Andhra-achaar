-- =====================================================================
-- Venkat Ramana Pickles - Supabase Schema
-- Run this ONCE in the Supabase SQL Editor for project jnkdhrgtulruwjlpfxhl
-- =====================================================================

-- --------- Extensions ---------
create extension if not exists "uuid-ossp";

-- --------- Enums ---------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin', 'primary_seller', 'sub_seller', 'customer');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum ('placed', 'accepted', 'ready_date_set', 'ready_for_takeaway', 'completed', 'cancelled');
  end if;
end $$;

-- --------- Tables ---------

create table if not exists public.user_profiles (
  id uuid primary key default uuid_generate_v4(),
  supabase_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role app_role not null default 'customer',
  store_id uuid,               -- for sellers/sub-sellers
  created_at timestamptz not null default now()
);
create index if not exists idx_user_profiles_supabase_id on public.user_profiles(supabase_id);
create index if not exists idx_user_profiles_store_id on public.user_profiles(store_id);

create table if not exists public.stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  opens_at time not null default '09:00',
  closes_at time not null default '21:00',
  primary_seller_id uuid references public.user_profiles(id) on delete set null,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_stores_primary_seller on public.stores(primary_seller_id);

-- add FK from user_profiles.store_id -> stores.id
alter table public.user_profiles
  drop constraint if exists user_profiles_store_id_fkey,
  add constraint user_profiles_store_id_fkey
  foreign key (store_id) references public.stores(id) on delete set null;

create table if not exists public.pickles (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  ingredients text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_pickles_store on public.pickles(store_id);

create table if not exists public.packaging_options (
  id uuid primary key default uuid_generate_v4(),
  pickle_id uuid not null references public.pickles(id) on delete cascade,
  label text not null,          -- e.g. '250g Jar', '500g Pouch'
  price_inr numeric(10,2) not null,
  is_active boolean not null default true
);
create index if not exists idx_pkg_pickle on public.packaging_options(pickle_id);

create table if not exists public.home_sections (
  id uuid primary key default uuid_generate_v4(),
  title text not null,          -- e.g. 'Top Sellers', 'New Arrivals'
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.home_section_items (
  id uuid primary key default uuid_generate_v4(),
  section_id uuid not null references public.home_sections(id) on delete cascade,
  pickle_id uuid not null references public.pickles(id) on delete cascade,
  sort_order int not null default 0,
  unique(section_id, pickle_id)
);

create table if not exists public.cart_items (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.user_profiles(id) on delete cascade,
  pickle_id uuid not null references public.pickles(id) on delete cascade,
  packaging_id uuid not null references public.packaging_options(id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique(customer_id, pickle_id, packaging_id)
);
create index if not exists idx_cart_customer on public.cart_items(customer_id);

create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.user_profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  status order_status not null default 'placed',
  total_inr numeric(10,2) not null default 0,
  ready_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_orders_store on public.orders(store_id);
create index if not exists idx_orders_status on public.orders(status);

create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  pickle_id uuid not null references public.pickles(id),
  packaging_id uuid not null references public.packaging_options(id),
  pickle_name text not null,
  packaging_label text not null,
  unit_price_inr numeric(10,2) not null,
  quantity int not null,
  line_total_inr numeric(10,2) not null
);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- --------- Trigger: auto-create user_profile on auth.users insert ---------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (supabase_id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'customer'::public.app_role
  )
  on conflict (supabase_id) do nothing;
  return new;
exception when others then
  raise log 'handle_new_user error for %: %', new.id, sqlerrm;
  return new;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant insert, select, update on public.user_profiles to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------- RLS ---------
alter table public.user_profiles enable row level security;
alter table public.stores enable row level security;
alter table public.pickles enable row level security;
alter table public.packaging_options enable row level security;
alter table public.home_sections enable row level security;
alter table public.home_section_items enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Helper: current user profile row
create or replace function public.current_profile_id() returns uuid as $$
  select id from public.user_profiles where supabase_id = auth.uid() limit 1;
$$ language sql stable security definer;

create or replace function public.current_role() returns app_role as $$
  select role from public.user_profiles where supabase_id = auth.uid() limit 1;
$$ language sql stable security definer;

create or replace function public.current_store_id() returns uuid as $$
  select store_id from public.user_profiles where supabase_id = auth.uid() limit 1;
$$ language sql stable security definer;

-- user_profiles
drop policy if exists "own profile read" on public.user_profiles;
create policy "own profile read" on public.user_profiles for select
  to authenticated using (supabase_id = auth.uid() or public.current_role() = 'admin');
drop policy if exists "own profile update" on public.user_profiles;
create policy "own profile update" on public.user_profiles for update
  to authenticated using (supabase_id = auth.uid()) with check (supabase_id = auth.uid());
drop policy if exists "admin manage profiles" on public.user_profiles;
create policy "admin manage profiles" on public.user_profiles for all
  to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- stores: everyone can read; admins manage; sellers can update their own
drop policy if exists "stores public read" on public.stores;
create policy "stores public read" on public.stores for select to anon, authenticated using (true);
drop policy if exists "admin manage stores" on public.stores;
create policy "admin manage stores" on public.stores for all
  to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
drop policy if exists "seller update own store" on public.stores;
create policy "seller update own store" on public.stores for update
  to authenticated using (id = public.current_store_id()) with check (id = public.current_store_id());

-- pickles: public read; sellers of the store manage; admin manage
drop policy if exists "pickles public read" on public.pickles;
create policy "pickles public read" on public.pickles for select to anon, authenticated using (true);
drop policy if exists "sellers manage pickles" on public.pickles;
create policy "sellers manage pickles" on public.pickles for all
  to authenticated using (
    public.current_role() in ('admin','primary_seller','sub_seller') and
    (public.current_role() = 'admin' or store_id = public.current_store_id())
  ) with check (
    public.current_role() in ('admin','primary_seller','sub_seller') and
    (public.current_role() = 'admin' or store_id = public.current_store_id())
  );

-- packaging_options
drop policy if exists "pkg public read" on public.packaging_options;
create policy "pkg public read" on public.packaging_options for select to anon, authenticated using (true);
drop policy if exists "sellers manage pkg" on public.packaging_options;
create policy "sellers manage pkg" on public.packaging_options for all
  to authenticated using (
    public.current_role() in ('admin','primary_seller','sub_seller') and
    (public.current_role() = 'admin' or exists(
      select 1 from public.pickles p where p.id = pickle_id and p.store_id = public.current_store_id()
    ))
  ) with check (
    public.current_role() in ('admin','primary_seller','sub_seller') and
    (public.current_role() = 'admin' or exists(
      select 1 from public.pickles p where p.id = pickle_id and p.store_id = public.current_store_id()
    ))
  );

-- home_sections & items: public read; admin manage
drop policy if exists "sections public read" on public.home_sections;
create policy "sections public read" on public.home_sections for select to anon, authenticated using (true);
drop policy if exists "admin sections" on public.home_sections;
create policy "admin sections" on public.home_sections for all
  to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
drop policy if exists "section items public read" on public.home_section_items;
create policy "section items public read" on public.home_section_items for select to anon, authenticated using (true);
drop policy if exists "admin section items" on public.home_section_items;
create policy "admin section items" on public.home_section_items for all
  to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- cart_items: own only
drop policy if exists "own cart" on public.cart_items;
create policy "own cart" on public.cart_items for all
  to authenticated using (customer_id = public.current_profile_id()) with check (customer_id = public.current_profile_id());

-- orders: customer sees own; seller sees store's; admin sees all
drop policy if exists "order read" on public.orders;
create policy "order read" on public.orders for select
  to authenticated using (
    customer_id = public.current_profile_id()
    or store_id = public.current_store_id()
    or public.current_role() = 'admin'
  );
drop policy if exists "order insert customer" on public.orders;
create policy "order insert customer" on public.orders for insert
  to authenticated with check (customer_id = public.current_profile_id());
drop policy if exists "order update seller" on public.orders;
create policy "order update seller" on public.orders for update
  to authenticated using (
    store_id = public.current_store_id() or public.current_role() = 'admin'
  ) with check (
    store_id = public.current_store_id() or public.current_role() = 'admin'
  );

-- order_items: read follows order visibility; insert if own order
drop policy if exists "order items read" on public.order_items;
create policy "order items read" on public.order_items for select
  to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and (
      o.customer_id = public.current_profile_id()
      or o.store_id = public.current_store_id()
      or public.current_role() = 'admin'
    ))
  );
drop policy if exists "order items insert" on public.order_items;
create policy "order items insert" on public.order_items for insert
  to authenticated with check (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = public.current_profile_id())
  );

-- =====================================================================
-- SEED DATA (safe to re-run)
-- =====================================================================

insert into public.home_sections (title, sort_order) values
  ('Top Sellers', 1), ('Featured', 2), ('New Arrivals', 3)
on conflict do nothing;

-- After running this SQL, sign up an admin user via the app and then run:
--   update public.user_profiles set role = 'admin' where full_name = '<your email>';
