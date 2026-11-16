-- Ratings (Nov 16)
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
--
-- Thumbs up or down, a Swipe, or "I bought this" on one result (PLAN.md › Learning loop and
-- Data model › ratings). One row per friend per result: rating again changes it. Each friend
-- reads and changes only their own ratings.
--
-- judge_* columns keep what the judge had said about the piece when it was rated, so the app
-- can count how often people agree with the judge (Maggie, Nov 16: learn from everyone's
-- feedback to improve what the app suggests).

create table if not exists public.ratings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade default auth.uid(),
  candidate_id    uuid not null references public.candidates (id) on delete cascade,
  search_id       uuid not null references public.searches (id) on delete cascade,
  vote            text not null check (vote in ('up', 'down')),
  reason          text not null default '',          -- the one-tap reason, e.g. "Wrong color"
  note            text not null default '',          -- optional typed note
  scope           text not null default 'taste' check (scope in ('taste', 'item')),  -- item = "Just this piece"
  source          text not null default 'card' check (source in ('card', 'detail', 'swipe')),
  bought          boolean not null default false,    -- "I bought this": the strongest yes
  -- Snapshot, so the rating still makes sense if the result changes
  title           text not null default '',
  store           text not null default '',
  link            text not null default '',
  -- What the judge said when it was rated
  judge_verdict   text,                              -- approved, caveat, rejected
  judge_look      int,
  judge_fit       int,
  judge_answer    text,                              -- the checklist answer for the reason's item, e.g. color: match
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, candidate_id)
);

create index if not exists ratings_user on public.ratings (user_id, created_at desc);

alter table public.ratings enable row level security;
revoke all on public.ratings from anon;

create policy "Read own ratings"
  on public.ratings for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Add own ratings"
  on public.ratings for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Change own ratings"
  on public.ratings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Remove own ratings"
  on public.ratings for delete to authenticated
  using (user_id = (select auth.uid()));
