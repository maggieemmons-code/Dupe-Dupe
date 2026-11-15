-- Taste rules and the AliExpress setting (Nov 15)
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
--
-- taste_profiles: one friend's eye, in plain rules the brief builder, screener and
-- judge read, plus the checklist weights that rules adjust (PLAN.md › Data model).
-- Started early from Maggie's test set; the ratings that grow it come in phase 7.

create table if not exists public.taste_profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  rules       jsonb not null default '[]',   -- [{ rule, kind, evidence, source: "test set" | "You added" }]
  weights     jsonb not null default '{}',   -- checklist weights that differ from the defaults
  updated_at  timestamptz not null default now()
);

alter table public.taste_profiles enable row level security;
revoke all on public.taste_profiles from anon;

create policy "Read own taste"
  on public.taste_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Add own taste"
  on public.taste_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Change own taste"
  on public.taste_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger taste_profiles_touch
  before update on public.taste_profiles
  for each row execute function public.touch_updated_at();

-- AliExpress is off unless a friend turns it on (PLAN.md › AliExpress).
alter table public.profiles
  add column if not exists allow_aliexpress boolean not null default false;
