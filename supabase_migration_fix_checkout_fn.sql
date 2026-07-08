-- Fix checkout() function:
--   1. Replace prickel_varients (typo) with pickle_variants (actual table name)
--   2. Include packaging_cost in order total and line totals (matches frontend pricing)

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
      sum((vp.selling_price_inr + vp.packaging_cost) * c.quantity)
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
      (vp.selling_price_inr + vp.packaging_cost), c.quantity,
      (vp.selling_price_inr + vp.packaging_cost) * c.quantity
    from public.cart_items c
    join public.pickles p on p.id = c.pickle_id
    join public.variant_packagings vp on vp.id = c.variant_packaging_id
    join public.pickle_variants pv on pv.id = vp.variant_id
    join public.packaging_types pt on pt.id = vp.packaging_type_id
    where c.customer_id = v_customer and p.store_id = v_store;

    return next v_order;
  end loop;

  delete from public.cart_items where customer_id = v_customer;
end;
$$;

grant execute on function public.checkout() to authenticated;
