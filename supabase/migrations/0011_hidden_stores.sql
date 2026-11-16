-- Hidden stores (Nov 15)
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
--
-- A friend can say "Don't show this store" (Maggie: The Dress Outlet and DDMINE). Each row is
-- one friend's choice about one store: hidden now, favorite later (PLAN.md › Data model,
-- store_prefs). Each friend reads and changes only their own rows.

create table if not exists public.store_prefs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null,                 -- the store as shown, e.g. "The Dress Outlet"
  domain      text not null default '',      -- its web address when known, e.g. "thedressoutlet.com"
  kind        text not null check (kind in ('hidden', 'favorite')),
  created_at  timestamptz not null default now(),
  unique (user_id, name, kind)
);

alter table public.store_prefs enable row level security;
revoke all on public.store_prefs from anon;

create policy "Read own store choices"
  on public.store_prefs for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Add own store choices"
  on public.store_prefs for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Remove own store choices"
  on public.store_prefs for delete to authenticated
  using (user_id = (select auth.uid()));
