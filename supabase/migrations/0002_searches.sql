-- Phase 2: start and brief
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
-- It creates the searches table, the private photo folder, the paid-call log
-- and their security rules.

-------------------------------------------------------------------------------
-- Searches: one row per search a friend starts
-------------------------------------------------------------------------------
create table public.searches (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- new: just started · briefing: brief builder running · review: waiting for the friend
  -- queued → gathering → screening → enriching → judging → done (phase 3 on) · failed
  status            text not null default 'new' check (status in
                      ('new', 'briefing', 'review', 'queued', 'gathering', 'screening',
                       'enriching', 'judging', 'done', 'failed')),
  error             text,

  -- What the friend gave us
  source_links      text[] not null default '{}',
  pasted_text       text not null default '',
  photo_paths       text[] not null default '{}',

  -- Plain item fields the friend sees and edits (the source of truth)
  brand             text not null default '',
  style_name        text not null default '',
  category          text not null default '',
  color             text not null default '',
  composition       text not null default '',
  fabrics           text[] not null default '{}',
  care              text[] not null default '{}',
  fit_style         text[] not null default '{}',
  stretch           text[] not null default '{}',
  neckline          text not null default '',
  sleeve            text not null default '',
  hem               text not null default '',
  closure           text not null default '',
  features          text not null default '',
  retail_price      numeric,
  fit_notes         text not null default '',
  field_sources     jsonb not null default '{}',   -- per field: link, photo, typed, guess, edited

  -- The friend's choices for this search
  budget            numeric,
  sizes             text[] not null default '{}',
  measurements      jsonb not null default '{}',
  view              text not null default 'all' check (view in ('all', 'new', 'used')),

  -- What the agents read (rebuilt when the plain fields change)
  visual_brief      jsonb,
  composition_brief jsonb,
  search_queries    jsonb,
  brief_built_at    timestamptz,
  brief_stale       boolean not null default false,

  retried           boolean not null default false,
  ran_at            timestamptz,
  changed_at        timestamptz,
  cost_estimate     numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index searches_user_created on public.searches (user_id, created_at desc);

alter table public.searches enable row level security;
revoke all on public.searches from anon;

create policy "Read own searches"
  on public.searches for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Start own searches"
  on public.searches for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Update own searches"
  on public.searches for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Delete own searches"
  on public.searches for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger searches_touch
  before update on public.searches
  for each row execute function public.touch_updated_at();

-------------------------------------------------------------------------------
-- Paid and outside calls, for the usage screen and the budget stop
-------------------------------------------------------------------------------
create table public.api_calls (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  search_id     uuid references public.searches (id) on delete set null,
  service       text not null check (service in ('serpapi', 'claude', 'tinyfish', 'ebay')),
  stage         text not null,
  units         jsonb not null default '{}',   -- e.g. tokens in and out, pages read
  est_cost      numeric,
  ok            boolean not null,
  error         text,
  created_at    timestamptz not null default now()
);

create index api_calls_created on public.api_calls (created_at desc);

alter table public.api_calls enable row level security;
revoke all on public.api_calls from anon;
revoke update, delete on public.api_calls from authenticated;

create policy "Log own calls"
  on public.api_calls for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Read own calls"
  on public.api_calls for select to authenticated
  using (user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- Private photo folder: photos/<user_id>/<search_id>/<n>.jpg
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg']);

create policy "Read own photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Add own photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Delete own photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
