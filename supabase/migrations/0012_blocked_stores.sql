-- Stores blocked for everyone, learned from what friends hide (Nov 15)
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
--
-- Maggie: "as more people opt to hide retailers, we should learn from what everyone hides to
-- inform which retailers we should permanently hide." When several friends hide the same store,
-- Maggie sees it on Hidden stores and can block it for everyone (she approves each one).
-- The fixed block list in lib/stores.ts stays; these are added to it without a code change.

create table if not exists public.blocked_stores (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- the store as shown, e.g. "The Dress Outlet"
  domain      text not null default '',      -- its web address when known
  blocked_by  uuid references auth.users (id) on delete set null default auth.uid(),
  friends     int not null default 0,        -- how many friends had hidden it when it was blocked
  created_at  timestamptz not null default now()
);

alter table public.blocked_stores enable row level security;
revoke all on public.blocked_stores from anon;

-- Everyone signed in can read it (results must leave these stores out); only Maggie changes it.
create policy "Read blocked stores"
  on public.blocked_stores for select to authenticated
  using (true);

create policy "Admin blocks stores"
  on public.blocked_stores for insert to authenticated
  with check ((select public.is_admin()));

create policy "Admin unblocks stores"
  on public.blocked_stores for delete to authenticated
  using ((select public.is_admin()));

-- How many different friends hid each store. Counts only, never who: and only Maggie may ask.
create or replace function public.hidden_store_counts()
returns table (name text, domain text, friends bigint)
language sql
stable
security definer
set search_path = ''
as $$
  -- "SHOP DDMINE" and "shop ddmine" are one store.
  select max(p.name) as name, max(p.domain) as domain, count(distinct p.user_id) as friends
  from public.store_prefs p
  where p.kind = 'hidden' and (select public.is_admin())
  group by lower(regexp_replace(p.name, '[^a-zA-Z0-9]', '', 'g'))
  order by 3 desc, 1;
$$;

revoke execute on function public.hidden_store_counts() from public, anon;
grant execute on function public.hidden_store_counts() to authenticated;
