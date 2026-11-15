-- Phase 3 update: link Google Shopping results to the store's own page.
-- Paste this whole file into Supabase › SQL Editor and click Run, once, after 0004.
--
-- Google Shopping only gives a link to Google's product page. When a friend
-- taps Shop, the /go route asks SerpApi which stores sell it (1 search), saves
-- the store's own page here, and forwards there. The next tap is instant.

alter table public.candidates
  add column if not exists product_token text,          -- SerpApi's token for that store lookup
  add column if not exists store_link    text,          -- the store's own product page, once looked up
  add column if not exists store_details text[] not null default '{}'; -- "In stock online", "30-day returns"…
