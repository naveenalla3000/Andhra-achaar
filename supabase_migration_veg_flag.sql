-- =====================================================================
-- Migration: add is_veg flag to pickles
-- Run ONCE in Supabase SQL Editor for project jnkdhrgtulruwjlpfxhl.
-- =====================================================================

ALTER TABLE public.pickles
  ADD COLUMN IF NOT EXISTS is_veg boolean NOT NULL DEFAULT true;
