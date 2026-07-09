-- =========================================================
-- Order timeline, email on profiles, ready_date → timestamptz
-- =========================================================

-- 1. Add email to user_profiles
-- =========================================================
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS email text;

-- backfill from auth.users for existing rows
UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.supabase_id = au.id
  AND up.email IS NULL;

-- keep email in sync on new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
begin
  insert into public.user_profiles (supabase_id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'customer'::public.app_role
  )
  on conflict (supabase_id) do update
    set email = excluded.email
    where public.user_profiles.email is null;
  return new;
exception when others then
  raise log 'handle_new_user error for %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- =========================================================
-- 2. Change orders.ready_date from date to timestamptz
--    Existing date rows cast to midnight UTC — harmless
-- =========================================================
ALTER TABLE public.orders
  ALTER COLUMN ready_date TYPE timestamptz
  USING ready_date::timestamptz;

-- =========================================================
-- 3. Order timeline table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.order_timeline (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type    text NOT NULL,   -- 'placed','status_change','assigned','unassigned'
  from_status   text,            -- previous status (for status_change)
  to_status     text,            -- new status (for status_change or placed)
  actor_id      uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  actor_name    text NOT NULL DEFAULT 'System',
  actor_role    text NOT NULL DEFAULT 'system',
  sub_seller_id   uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  sub_seller_name text,          -- denormalized name for assign/unassign events
  created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_timeline_order_id
  ON public.order_timeline (order_id, created_at);

ALTER TABLE public.order_timeline ENABLE ROW LEVEL SECURITY;

-- Timeline read = same access as orders
DROP POLICY IF EXISTS "order timeline read" ON public.order_timeline;
CREATE POLICY "order timeline read" ON public.order_timeline
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_timeline.order_id
        AND (
          o.customer_id = public.current_profile_id()
          OR (public."current_role"() = 'primary_seller' AND o.store_id = public.current_store_id())
          OR (public."current_role"() = 'sub_seller'
              AND o.store_id = public.current_store_id()
              AND o.assigned_to = public.current_profile_id())
          OR public."current_role"() = 'admin'
        )
    )
  );

-- =========================================================
-- 4. Trigger: record timeline on every meaningful order change
-- =========================================================
CREATE OR REPLACE FUNCTION public.record_order_timeline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
declare
  v_actor_id   uuid;
  v_actor_name text := 'System';
  v_actor_role text := 'system';
  v_ss_name    text;
begin
  -- resolve the acting user
  v_actor_id := public.current_profile_id();
  if v_actor_id is not null then
    select full_name, role::text
    into v_actor_name, v_actor_role
    from public.user_profiles
    where id = v_actor_id;
    v_actor_name := coalesce(v_actor_name, 'Unknown');
  end if;

  -- INSERT → order placed
  if TG_OP = 'INSERT' then
    insert into public.order_timeline
      (order_id, event_type, to_status, actor_id, actor_name, actor_role)
    values
      (NEW.id, 'placed', 'placed', v_actor_id, v_actor_name, v_actor_role);
    return NEW;
  end if;

  -- UPDATE: status changed?
  if OLD.status <> NEW.status then
    insert into public.order_timeline
      (order_id, event_type, from_status, to_status, actor_id, actor_name, actor_role)
    values
      (NEW.id, 'status_change', OLD.status::text, NEW.status::text,
       v_actor_id, v_actor_name, v_actor_role);
  end if;

  -- UPDATE: assignment changed?
  if OLD.assigned_to is distinct from NEW.assigned_to then
    if NEW.assigned_to is not null then
      select full_name into v_ss_name
      from public.user_profiles where id = NEW.assigned_to;

      insert into public.order_timeline
        (order_id, event_type, actor_id, actor_name, actor_role,
         sub_seller_id, sub_seller_name)
      values
        (NEW.id, 'assigned', v_actor_id, v_actor_name, v_actor_role,
         NEW.assigned_to, v_ss_name);
    else
      if OLD.assigned_to is not null then
        select full_name into v_ss_name
        from public.user_profiles where id = OLD.assigned_to;
      end if;

      insert into public.order_timeline
        (order_id, event_type, actor_id, actor_name, actor_role, sub_seller_name)
      values
        (NEW.id, 'unassigned', v_actor_id, v_actor_name, v_actor_role, v_ss_name);
    end if;
  end if;

  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS trg_order_timeline ON public.orders;
CREATE TRIGGER trg_order_timeline
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.record_order_timeline();

-- =========================================================
-- 5. RPC: get customer details for an order (sellers only)
--    Reads email from auth.users via SECURITY DEFINER
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_order_customer_details(p_order_id uuid)
RETURNS TABLE (full_name text, email text, phone text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_caller_id   uuid := public.current_profile_id();
  v_caller_role text := public."current_role"()::text;
  v_store_id    uuid := public.current_store_id();
  v_customer_id   uuid;
  v_order_store   uuid;
  v_assigned_to   uuid;
begin
  select o.customer_id, o.store_id, o.assigned_to
  into v_customer_id, v_order_store, v_assigned_to
  from public.orders o
  where o.id = p_order_id;

  if not found then
    raise exception 'Order not found';
  end if;

  -- only primary_seller of the store, assigned sub_seller, or admin
  if v_caller_role = 'admin' then
    -- ok
  elsif v_caller_role = 'primary_seller' and v_order_store = v_store_id then
    -- ok
  elsif v_caller_role = 'sub_seller' and v_assigned_to = v_caller_id then
    -- ok
  else
    raise exception 'Access denied';
  end if;

  return query
  select
    up.full_name,
    coalesce(up.email, au.email) as email,
    up.phone
  from public.user_profiles up
  left join auth.users au on au.id = up.supabase_id
  where up.id = v_customer_id;
end;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_customer_details(uuid) TO authenticated;
