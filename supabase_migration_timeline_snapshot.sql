-- =========================================================
-- Drop FK constraints on order_timeline actor/sub_seller cols
-- so the timeline is a true immutable snapshot, independent
-- of any future edits or deletes to user_profiles.
-- actor_name, actor_role, sub_seller_name already store the
-- snapshot at event time — the IDs are retained for
-- informational purposes only (no referential constraint).
-- =========================================================

ALTER TABLE public.order_timeline
  DROP CONSTRAINT IF EXISTS order_timeline_actor_id_fkey;

ALTER TABLE public.order_timeline
  DROP CONSTRAINT IF EXISTS order_timeline_sub_seller_id_fkey;
