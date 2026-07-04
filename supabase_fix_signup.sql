-- =====================================================================
-- FIX: "Database error saving new user" on signup
-- Run this in the Supabase SQL editor
-- Cause: SECURITY DEFINER trigger function did not fix search_path,
-- so it could not resolve public.user_profiles / app_role, and
-- supabase_auth_admin also needed table/function grants.
-- =====================================================================

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
  -- never block auth signup because of a profile issue
  raise log 'handle_new_user error for %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- Make sure Supabase Auth service can actually run the trigger
grant usage on schema public to supabase_auth_admin;
grant insert, select, update on public.user_profiles to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Recreate trigger (idempotent)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
