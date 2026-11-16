-- Search progress (Nov 15)
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
