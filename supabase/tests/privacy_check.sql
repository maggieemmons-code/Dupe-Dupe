-- Privacy check: one friend can't read or change another friend's profile.
-- Paste into Supabase › SQL Editor and click Run. It changes nothing:
-- it makes two pretend friends inside a transaction and undoes it at the end.
-- Every row in the result should say PASS.

begin;

-- Two pretend friends (the sign-up trigger gives each a profile).
insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'friend-a@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'friend-b@test.invalid', 'authenticated', 'authenticated');

create temp table results (check_name text, result text) on commit drop;
grant all on results to authenticated;

-- Act as friend A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into results
select 'Friend A sees only their own profile',
       case when count(*) = 1 and bool_and(email = 'friend-a@test.invalid') then 'PASS' else 'FAIL' end
from public.profiles;

with changed as (
  update public.profiles set name = 'hacked'
  where id = '00000000-0000-0000-0000-00000000000b'
  returning 1
)
insert into results
select 'Friend A cannot change friend B''s profile',
       case when count(*) = 0 then 'PASS' else 'FAIL' end
from changed;

insert into results
select 'Friend A cannot see the invite list',
       case when count(*) = 0 then 'PASS' else 'FAIL' end
from public.invites;

reset role;
select * from results;

rollback;
