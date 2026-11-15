-- Phase 3: Lens and new dupes
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
-- It adds the candidates table (every item a search finds, shown or not),
-- the events table (clicks on "Shop"), and turns on live updates so result
-- cards appear on the phone as they're found.

-------------------------------------------------------------------------------
-- Candidates: every item gathered for a search, with how far it got and why
-- it was dropped. The background job writes these with the server key;
-- friends can only read their own.
-------------------------------------------------------------------------------
create table public.candidates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  search_id         uuid not null references public.searches (id) on delete cascade,

  kind              text not null check (kind in ('new', 'secondhand')),
  source            text not null,            -- lens, shopping, amazon (ebay, tinyfish from phase 5)
  query             text not null default '', -- the words or photo search that found it
  position          int,                      -- its place in that source's results

  -- What the source says (never filled in by an agent)
  title             text not null default '',
  brand             text not null default '',
  store             text not null default '',
  store_domain      text not null default '',
  link              text not null,
  link_is_google    boolean not null default false, -- Google's product page, not the store's own
  photo_url         text,
  thumb_url         text,
  price             numeric,
  old_price         numeric,
  price_is_estimate boolean not null default false, -- Lens prices aren't live
  price_checked_at  timestamptz,
  currency          text not null default 'USD',
  condition         text not null default '',
  size              text not null default '',
  color             text not null default '',
  rating            numeric,
  reviews           int,
  delivery          text not null default '',
  in_stock          boolean,

  -- How far it got
  stage             text not null default 'gathered' check (stage in
                      ('gathered', 'cleaned', 'screened', 'enriched', 'judged')),
  drop_reason       text,                     -- null while it's still in the running
  duplicate_of      uuid references public.candidates (id) on delete set null,

  -- The screener's view (phase 3)
  screen_note       text,
  screen_rank       int,                      -- the screener's order, best first
  color_match       text check (color_match in ('same', 'close', 'different', 'unclear')),

  -- Enrich and judge (phases 4 to 6)
  composition_raw   text,
  availability      text,
  checklist         jsonb,
  fabric_tier       text,
  stock_photo_flag  boolean,
  judge_note        text,
  confidence        numeric,
  look_score        int,
  fit_score         int,
  verdict           text check (verdict in ('approved', 'caveat', 'rejected')),
  caveat            text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index candidates_search on public.candidates (search_id, stage);

alter table public.candidates enable row level security;
revoke all on public.candidates from anon;
revoke insert, update, delete on public.candidates from authenticated;

create policy "Read own candidates"
  on public.candidates for select to authenticated
  using (user_id = (select auth.uid()));

create trigger candidates_touch
  before update on public.candidates
  for each row execute function public.touch_updated_at();

-------------------------------------------------------------------------------
-- Events: something a friend did (phase 3 logs clicks on "Shop")
-------------------------------------------------------------------------------
create table public.events (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type          text not null check (type in
                  ('search_started', 'result_clicked', 'rated', 'anchor_edited',
                   'field_corrected', 'view_changed')),
  search_id     uuid references public.searches (id) on delete set null,
  candidate_id  uuid references public.candidates (id) on delete set null,
  detail        jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index events_created on public.events (created_at desc);

alter table public.events enable row level security;
revoke all on public.events from anon;
revoke update, delete on public.events from authenticated;

create policy "Log own events"
  on public.events for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Read own events"
  on public.events for select to authenticated
  using (user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- Searches: which sources were missing, so Results can say so
-------------------------------------------------------------------------------
alter table public.searches
  add column missing_sources text[] not null default '{}';

-------------------------------------------------------------------------------
-- Live updates: the Results screen listens for new candidates and status changes.
-- Row-level security still applies, so each friend only hears about their own.
-------------------------------------------------------------------------------
alter publication supabase_realtime add table public.candidates, public.searches;
