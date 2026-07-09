-- =========================================================
-- Sub-seller order assignment + role change history
-- =========================================================

-- 1. Add assigned_to to orders
--    NULL  = unassigned (primary seller handles)
--    non-NULL = delegated to a specific sub-seller
-- =========================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_to uuid
    REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_assigned_to
  ON public.orders (assigned_to);

-- =========================================================
-- 2. Role change history (audit trail)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_role_history (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  changed_by   uuid NOT NULL REFERENCES public.user_profiles(id),
  old_role     public.app_role NOT NULL,
  new_role     public.app_role NOT NULL,
  old_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  new_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  changed_at   timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.user_role_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read role history" ON public.user_role_history;
CREATE POLICY "admin read role history" ON public.user_role_history
  FOR SELECT TO authenticated
  USING (public."current_role"() = 'admin');

-- =========================================================
-- 3. Updated order RLS policies
--    primary_seller  → all orders for their store
--    sub_seller      → only orders at their store assigned to them
--    customer        → own orders
--    admin           → all
-- =========================================================
DROP POLICY IF EXISTS "order read" ON public.orders;
CREATE POLICY "order read" ON public.orders
  FOR SELECT TO authenticated
  USING (
    customer_id = public.current_profile_id()
    OR (public."current_role"() = 'primary_seller'
        AND store_id = public.current_store_id())
    OR (public."current_role"() = 'sub_seller'
        AND store_id = public.current_store_id()
        AND assigned_to = public.current_profile_id())
    OR public."current_role"() = 'admin'
  );

DROP POLICY IF EXISTS "order update seller" ON public.orders;
CREATE POLICY "order update seller" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    (public."current_role"() = 'primary_seller'
      AND store_id = public.current_store_id())
    OR (public."current_role"() = 'sub_seller'
        AND store_id = public.current_store_id()
        AND assigned_to = public.current_profile_id())
    OR public."current_role"() = 'admin'
  )
  WITH CHECK (
    (public."current_role"() = 'primary_seller'
      AND store_id = public.current_store_id())
    OR (public."current_role"() = 'sub_seller'
        AND store_id = public.current_store_id()
        AND assigned_to = public.current_profile_id())
    OR public."current_role"() = 'admin'
  );

-- =========================================================
-- 4. Updated order_items RLS — mirrors orders read policy
-- =========================================================
DROP POLICY IF EXISTS "order items read" ON public.order_items;
CREATE POLICY "order items read" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          o.customer_id = public.current_profile_id()
          OR (public."current_role"() = 'primary_seller'
              AND o.store_id = public.current_store_id())
          OR (public."current_role"() = 'sub_seller'
              AND o.store_id = public.current_store_id()
              AND o.assigned_to = public.current_profile_id())
          OR public."current_role"() = 'admin'
        )
    )
  );

-- =========================================================
-- 5. Trigger: sub-sellers cannot change assigned_to
-- =========================================================
CREATE OR REPLACE FUNCTION public.prevent_sub_seller_reassign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
begin
  if public."current_role"() = 'sub_seller'
     and (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) then
    raise exception 'Sub-sellers cannot change order assignment';
  end if;
  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS trg_prevent_sub_seller_reassign ON public.orders;
CREATE TRIGGER trg_prevent_sub_seller_reassign
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sub_seller_reassign();

-- =========================================================
-- 6. admin_change_role — atomic role + store change
--
--    What it does:
--    • records the change in user_role_history
--    • if leaving primary_seller: clears stores.primary_seller_id
--    • if was sub_seller: clears assigned_to on in-progress orders
--      at the old store so primary seller can take over
--    • updates user_profiles (role + store_id)
--    • if becoming primary_seller: sets stores.primary_seller_id
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_change_role(
  p_user_id      uuid,
  p_new_role     public.app_role,
  p_new_store_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_admin_id     uuid := public.current_profile_id();
  v_old_role     public.app_role;
  v_old_store_id uuid;
begin
  if public."current_role"() <> 'admin' then
    raise exception 'Only admin can change roles';
  end if;

  if p_new_role in ('primary_seller', 'sub_seller') and p_new_store_id is null then
    raise exception 'A store must be specified for seller roles';
  end if;

  select role, store_id
  into v_old_role, v_old_store_id
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'User not found';
  end if;

  -- audit trail
  insert into public.user_role_history
    (user_id, changed_by, old_role, new_role, old_store_id, new_store_id)
  values
    (p_user_id, v_admin_id, v_old_role, p_new_role, v_old_store_id, p_new_store_id);

  -- leaving primary_seller role or moving to a different store as primary_seller
  if v_old_role = 'primary_seller' and v_old_store_id is not null
     and (p_new_role <> 'primary_seller' or p_new_store_id is distinct from v_old_store_id)
  then
    update public.stores
    set primary_seller_id = null
    where id = v_old_store_id and primary_seller_id = p_user_id;
  end if;

  -- leaving sub_seller: clear in-progress assigned orders so primary seller takes over
  -- completed/cancelled orders keep assigned_to as audit trail
  if v_old_role = 'sub_seller' and v_old_store_id is not null then
    update public.orders
    set assigned_to = null, updated_at = now()
    where assigned_to = p_user_id
      and store_id = v_old_store_id
      and status not in ('completed', 'cancelled');
  end if;

  -- apply role + store change
  update public.user_profiles
  set
    role     = p_new_role,
    store_id = case
                 when p_new_role in ('primary_seller', 'sub_seller') then p_new_store_id
                 else null
               end
  where id = p_user_id;

  -- becoming primary_seller: claim the store
  if p_new_role = 'primary_seller' and p_new_store_id is not null then
    update public.stores
    set primary_seller_id = p_user_id
    where id = p_new_store_id;
  end if;
end;
$$;

GRANT EXECUTE ON FUNCTION public.admin_change_role(uuid, public.app_role, uuid)
  TO authenticated;

-- =========================================================
-- 7. Allow primary_seller to read profiles in their store
--    (needed to list sub-sellers when assigning orders)
-- =========================================================
DROP POLICY IF EXISTS "own profile read" ON public.user_profiles;
CREATE POLICY "own profile read" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    supabase_id = auth.uid()
    OR public."current_role"() = 'admin'
    OR (public."current_role"() = 'primary_seller'
        AND store_id = public.current_store_id())
  );
