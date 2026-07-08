-- =====================================================================
-- Migration: add description and layout_type to home_sections
-- Run this ONCE in the Supabase SQL Editor for project jnkdhrgtulruwjlpfxhl
-- =====================================================================

alter table public.home_sections
  add column if not exists description text,
  add column if not exists layout_type text not null default 'card';

alter table public.home_sections
  drop constraint if exists home_sections_layout_type_check,
  add constraint home_sections_layout_type_check
  check (layout_type in ('card', 'grid', 'list'));
