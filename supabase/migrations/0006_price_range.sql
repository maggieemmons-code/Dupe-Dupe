-- Phase 3 update: the budget becomes a price range with a low end (Maggie, Nov 15).
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
--
-- budget_min: the low end of the price slider on Review.
--   null = the default (15% of the original's price), 0 = no low end.
-- The existing `budget` column stays the high end (null = no limit).

alter table public.searches
  add column if not exists budget_min numeric;
