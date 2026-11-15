-- Phase 2 update: every detail is a pick from a list.
-- Paste this whole file into Supabase › SQL Editor and click Run, once.

alter table public.searches
  add column color_name text not null default '',   -- the store's own shade name, e.g. "Red Date"
  add column weave      text not null default '',   -- Jacquard, Satin, Crepe…
  add column sizing     text not null default '',   -- Runs small, True to size, Runs large
  add column details    text[] not null default '{}'; -- Boned / corset bodice, Slit, Fully lined…

-- `color` now holds the color family (Red, Navy…). `features` is no longer used.
comment on column public.searches.features is 'Unused since 0003; see details.';
