-- =====================================================================
-- Migration: allow authenticated users to self-heal a missing profile row
-- (i.e., if the profile was deleted from public.user_profiles, the app
-- will recreate it on next login with default role='customer').
-- Run once in Supabase SQL editor for project jnkdhrgtulruwjlpfxhl.
-- =====================================================================

drop policy if exists "own profile insert" on public.user_profiles;
create policy "own profile insert" on public.user_profiles for insert
  to authenticated with check (supabase_id = auth.uid());
