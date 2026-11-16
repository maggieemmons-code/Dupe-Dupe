-- Shopify's catalog as a source (Nov 15)
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
--
-- Every outside call writes a row to api_calls. Shopify's Global Catalog is a new
-- (free) outside service, so the list of allowed services gains "shopify".
-- Candidates from it are saved with source = 'shopify' (that column has no fixed list).

alter table public.api_calls drop constraint if exists api_calls_service_check;
alter table public.api_calls
  add constraint api_calls_service_check
  check (service in ('serpapi', 'claude', 'tinyfish', 'ebay', 'shopify'));
