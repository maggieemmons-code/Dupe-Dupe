-- Phase 1: sign-in
-- Paste this whole file into Supabase › SQL Editor and click Run, once.
-- It creates the invite list, friend profiles, their security rules,
-- and the gatekeeper that turns away emails that weren't invited.

-------------------------------------------------------------------------------
-- Invites: the emails allowed to sign in
-------------------------------------------------------------------------------
create table public.invites (
  email       text primary key check (email = lower(email)),
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

alter table public.invites enable row level security;

-------------------------------------------------------------------------------
-- Profiles: one row per friend, created automatically on first sign-in
-------------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text not null,
  name               text,
  default_sizes      text[] not null default '{}',
  default_view       text not null default 'all'  check (default_view in ('all', 'new', 'used')),
  default_sort       text not null default 'look' check (default_sort in ('look', 'fit', 'low', 'high')),
  daily_search_count integer not null default 0,
  daily_search_date  date,
  is_admin           boolean not null default false,
  created_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

-------------------------------------------------------------------------------
-- Who is an admin (Maggie). Used by the invite rules below.
-------------------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select is_admin from public.profiles where id = (select auth.uid())),
    false
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-------------------------------------------------------------------------------
-- Security rules
-------------------------------------------------------------------------------
-- Signed-out visitors can't touch either table.
revoke all on public.invites, public.profiles from anon;

-- A friend sees and edits only their own profile.
create policy "Read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Friends may change only their own preferences, never is_admin or the daily count.
revoke insert, update, delete on public.profiles from authenticated;
grant update (name, default_sizes, default_view, default_sort) on public.profiles to authenticated;

-- Only the admin can see or change the invite list.
create policy "Admin reads invites"
  on public.invites for select to authenticated
  using ((select public.is_admin()));

create policy "Admin adds invites"
  on public.invites for insert to authenticated
  with check ((select public.is_admin()));

create policy "Admin removes invites"
  on public.invites for delete to authenticated
  using ((select public.is_admin()));

revoke update on public.invites from authenticated;

-------------------------------------------------------------------------------
-- New account: create the profile and mark the invite accepted
-------------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, lower(new.email));

  update public.invites
     set accepted_at = now()
   where email = lower(new.email)
     and accepted_at is null;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- Gatekeeper: Supabase calls this before creating any account.
-- Turn it on in Authentication › Auth Hooks › "Before User Created".
-------------------------------------------------------------------------------
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  if v_email is null
     or not exists (select 1 from public.invites where email = v_email) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Dupe Dupe is invite-only for now.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
