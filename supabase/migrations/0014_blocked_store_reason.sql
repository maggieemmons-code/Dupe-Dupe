-- Why a store was blocked for everyone (Nov 16)
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
--
-- Maggie can block a store for everyone straight from a result, with a reason, starting with
-- "AliExpress dropship" (stores reselling AliExpress pieces under their own name). The reasons
-- build a list that can later help spot other dropshippers.

alter table public.blocked_stores
  add column if not exists reason text not null default '';
