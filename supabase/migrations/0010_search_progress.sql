-- Search progress and judge noise (Nov 15)
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
--
-- Results shows a progress bar with real counts while a search runs (Maggie, Nov 15).
-- The search job keeps those counts on the search: places searched, pieces found,
-- pieces looked over, listings read, matches checked. Friends read their own searches
-- as before (row-level security); only the server's job can change the counts.

alter table public.searches
  add column if not exists progress jsonb not null default '{}';

-- Adds to one count. Several steps run at once, so adding happens in the database
-- (read-and-write from the job could lose an update).
create or replace function public.bump_search_progress(p_search uuid, p_key text, p_by int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.searches
  set progress = jsonb_set(progress, array[p_key], to_jsonb(coalesce((progress ->> p_key)::int, 0) + p_by))
  where id = p_search;
$$;

-- Sets several counts at once, keeping the others.
create or replace function public.set_search_progress(p_search uuid, p_values jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.searches set progress = progress || p_values where id = p_search;
$$;

revoke execute on function public.bump_search_progress(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.set_search_progress(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bump_search_progress(uuid, text, int) to service_role;
grant execute on function public.set_search_progress(uuid, jsonb) to service_role;

-- Judge noise (Nov 15): twice a week the app re-judges 10 already-judged pieces and
-- counts how often the judge's answers change. Server only: friends never read it.
create table if not exists public.judge_noise (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  pieces           int not null,          -- pieces re-judged
  fields_compared  int not null,          -- checklist answers compared
  fields_changed   int not null,          -- answers that came back different
  verdicts_changed int not null,          -- approved / caveat / rejected that flipped
  rate             numeric not null,      -- fields_changed / fields_compared
  alert            boolean not null default false,
  details          jsonb not null default '[]'
);
alter table public.judge_noise enable row level security;
revoke all on public.judge_noise from anon, authenticated;
