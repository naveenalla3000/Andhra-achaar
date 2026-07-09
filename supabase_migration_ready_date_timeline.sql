-- =========================================================
-- Record a timeline event when ready_date is rescheduled
-- without a status transition (status stays ready_date_set).
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

  -- UPDATE: ready_date rescheduled without a status transition?
  -- (When first set, status changes too so this block is skipped.)
  if OLD.ready_date IS DISTINCT FROM NEW.ready_date
     AND OLD.status = NEW.status then
    insert into public.order_timeline
      (order_id, event_type, to_status, actor_id, actor_name, actor_role)
    values
      (NEW.id, 'ready_date_changed', NEW.status::text,
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
