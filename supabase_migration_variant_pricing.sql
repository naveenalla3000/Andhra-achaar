-- =====================================================================
-- Migration: variant-based pricing
-- Works from the ORIGINAL schema state (packaging_options still exists).
-- 1. Drops the old packaging_options table and cleans up all references.
-- 2. Adds price_inr to pickles (display/min price).
-- 3. Creates prickel_varients with mrp / selling_price / discount_pct.
-- 4. Adds variant_id to cart_items.
-- 5. Rewrites checkout() to use selling_price_inr.
-- Run ONCE in Supabase SQL Editor for project jnkdhrgtulruwjlpfxhl.
-- =====================================================================

-- ── Step 1: Clean up old packaging_options references ────────────────

-- Clear cart_items — they reference the old packaging_options rows
DELETE FROM public.cart_items;

-- Drop old packaging_id column from cart_items (and its FK + unique constraint)
ALTER TABLE public.cart_items
  DROP COLUMN IF EXISTS packaging_id CASCADE;

-- Drop any leftover unique constraints (cover both pre/post remove-packaging states)
ALTER TABLE public.cart_items
  DROP CONSTRAINT IF EXISTS cart_items_customer_id_pickle_id_packaging_id_key;
ALTER TABLE public.cart_items
  DROP CONSTRAINT IF EXISTS cart_items_customer_id_pickle_id_key;

-- Clean up order_items packaging columns (historical orders lose variant detail — acceptable)
ALTER TABLE public.order_items
  DROP COLUMN IF EXISTS packaging_id CASCADE,
  DROP COLUMN IF EXISTS packaging_label CASCADE;

-- Drop the old packaging_options table
DROP TABLE IF EXISTS public.packaging_options CASCADE;

-- ── Step 2: Add price_inr to pickles if not already present ──────────
ALTER TABLE public.pickles
  ADD COLUMN IF NOT EXISTS price_inr numeric(10,2) NOT NULL DEFAULT 0;

-- ── Step 3: Create prickel_varients ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prickel_varients (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  pickle_id         uuid          NOT NULL REFERENCES public.pickles(id) ON DELETE CASCADE,
  label             text          NOT NULL,
  mrp_inr           numeric(10,2) NOT NULL CHECK (mrp_inr > 0),
  selling_price_inr numeric(10,2) NOT NULL CHECK (selling_price_inr >= 0),
  discount_pct      numeric(5,2)  NOT NULL DEFAULT 0
                                  CHECK (discount_pct >= 0 AND discount_pct < 100),
  is_active         boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variants_pickle ON public.prickel_varients(pickle_id);

-- RLS for prickel_varients
ALTER TABLE public.prickel_varients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "variants public read" ON public.prickel_varients;
CREATE POLICY "variants public read" ON public.prickel_varients
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "sellers manage variants" ON public.prickel_varients;
CREATE POLICY "sellers manage variants" ON public.prickel_varients
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pickles p
      WHERE p.id = pickle_id AND p.store_id = public.current_store_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pickles p
      WHERE p.id = pickle_id AND p.store_id = public.current_store_id()
    )
  );

DROP POLICY IF EXISTS "admin manage variants" ON public.prickel_varients;
CREATE POLICY "admin manage variants" ON public.prickel_varients
  FOR ALL TO authenticated
  USING    (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- ── Step 4: Add variant_id to cart_items ─────────────────────────────
ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS variant_id uuid NOT NULL
    REFERENCES public.prickel_varients(id) ON DELETE CASCADE;

ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_customer_id_pickle_id_variant_id_key
  UNIQUE (customer_id, pickle_id, variant_id);

-- ── Step 5: Add variant columns to order_items ────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id    uuid REFERENCES public.prickel_varients(id),
  ADD COLUMN IF NOT EXISTS variant_label text;

-- ── Step 6: Rewrite checkout() ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.checkout()
RETURNS setof public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_customer uuid := public.current_profile_id();
  v_store    uuid;
  v_order    public.orders;
BEGIN
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'No profile for current user';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE customer_id = v_customer) THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  FOR v_store IN
    SELECT DISTINCT p.store_id
    FROM   public.cart_items c
    JOIN   public.pickles p ON p.id = c.pickle_id
    WHERE  c.customer_id = v_customer
  LOOP
    INSERT INTO public.orders (customer_id, store_id, status, total_inr)
    SELECT v_customer, v_store, 'placed',
           sum(pv.selling_price_inr * c.quantity)
    FROM   public.cart_items c
    JOIN   public.pickles p           ON p.id  = c.pickle_id
    JOIN   public.prickel_varients pv ON pv.id = c.variant_id
    WHERE  c.customer_id = v_customer
      AND  p.store_id    = v_store
    RETURNING * INTO v_order;

    INSERT INTO public.order_items
      (order_id, pickle_id, variant_id, pickle_name, variant_label,
       unit_price_inr, quantity, line_total_inr)
    SELECT v_order.id, p.id, pv.id, p.name, pv.label,
           pv.selling_price_inr, c.quantity, pv.selling_price_inr * c.quantity
    FROM   public.cart_items c
    JOIN   public.pickles p           ON p.id  = c.pickle_id
    JOIN   public.prickel_varients pv ON pv.id = c.variant_id
    WHERE  c.customer_id = v_customer
      AND  p.store_id    = v_store;

    RETURN NEXT v_order;
  END LOOP;

  DELETE FROM public.cart_items WHERE customer_id = v_customer;
END;
$$;
GRANT EXECUTE ON FUNCTION public.checkout() TO authenticated;
