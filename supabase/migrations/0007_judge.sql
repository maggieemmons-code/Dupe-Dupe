-- Phase 4: the judge
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
--
-- Before judging, each top pick's product details are looked up (description,
-- fabric words, shopper reviews). The judge fills a fixed checklist; code turns
-- it into the look and fit scores and the verdict (columns from 0004).

alter table public.candidates
  add column if not exists listing_text text,          -- what the lookup and page read found, for the judge and Item detail
  add column if not exists enriched_at  timestamptz,
  add column if not exists fabric_evidence text;       -- the listing's own words about fabric, quoted by the judge

create index if not exists candidates_verdict on public.candidates (search_id, verdict);
