-- =====================================================================
-- Migration: change stores.latitude / stores.longitude from numeric to text
-- Run this ONCE in the Supabase SQL editor for project jnkdhrgtulruwjlpfxhl
-- =====================================================================

alter table public.stores
  alter column latitude type text using latitude::text,
  alter column longitude type text using longitude::text;
