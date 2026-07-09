-- Add order_ref to orders for searchable/trackable order IDs

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_ref text;

-- Backfill existing rows with the same deterministic formula used in checkout()
UPDATE public.orders
SET order_ref = 'AA-' || to_char(created_at AT TIME ZONE 'UTC', 'YYYYMMDD')
                       || '-' || upper(left(replace(checkout_id::text, '-', ''), 4))
WHERE order_ref IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN order_ref SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_order_ref ON public.orders (order_ref);

-- Replace checkout() to stamp order_ref at insert time
CREATE OR REPLACE FUNCTION public.checkout() RETURNS SETOF public.orders
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_customer    uuid := public.current_profile_id();
  v_checkout_id uuid := gen_random_uuid();
  v_order_ref   text;
  v_store       uuid;
  v_order       public.orders;
begin
  if v_customer is null then
    raise exception 'No profile for current user';
  end if;

  if not exists (
    select 1 from public.cart_items where customer_id = v_customer
  ) then
    raise exception 'Cart is empty';
  end if;

  v_order_ref := 'AA-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD')
                        || '-' || upper(left(replace(v_checkout_id::text, '-', ''), 4));

  for v_store in
    select distinct p.store_id
    from public.cart_items c
    join public.pickles p on p.id = c.pickle_id
    where c.customer_id = v_customer
  loop
    insert into public.orders (
      customer_id,
      checkout_id,
      order_ref,
      store_id, store_name, store_address, store_image_url, store_latitude, store_longitude,
      status, total_inr
    )
    select
      v_customer,
      v_checkout_id,
      v_order_ref,
      v_store, s.name, s.address, s.image_url, s.latitude, s.longitude,
      'placed',
      sum((vp.selling_price_inr + vp.packaging_cost) * c.quantity)
    from public.cart_items c
    join public.pickles            p  on p.id  = c.pickle_id
    join public.variant_packagings vp on vp.id = c.variant_packaging_id
    join public.stores             s  on s.id  = p.store_id
    where c.customer_id = v_customer and p.store_id = v_store
    group by s.name, s.address, s.image_url, s.latitude, s.longitude
    returning * into v_order;

    insert into public.order_items (
      order_id,
      pickle_id, pickle_name, pickle_image_url,
      variant_id, variant_label,
      packaging_type_name,
      selling_price_inr, packaging_cost, mrp_inr, discount_pct,
      unit_price_inr, quantity, line_total_inr
    )
    select
      v_order.id,
      p.id, p.name, p.image_url,
      pv.id, pv.label,
      pt.name,
      vp.selling_price_inr, vp.packaging_cost, vp.mrp_inr, vp.discount_pct,
      (vp.selling_price_inr + vp.packaging_cost), c.quantity,
      (vp.selling_price_inr + vp.packaging_cost) * c.quantity
    from public.cart_items c
    join public.pickles            p  on p.id  = c.pickle_id
    join public.variant_packagings vp on vp.id = c.variant_packaging_id
    join public.pickle_variants    pv on pv.id = vp.variant_id
    join public.packaging_types    pt on pt.id = vp.packaging_type_id
    where c.customer_id = v_customer and p.store_id = v_store;

    return next v_order;
  end loop;

  delete from public.cart_items where customer_id = v_customer;
end;
$$;
