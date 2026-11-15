-- Shows your 3 most recent searches and what each outside call did.
-- Read-only: it changes nothing. Paste into Supabase › SQL Editor and click Run.
select
  s.created_at,
  s.status,
  s.retail_price,
  s.color, s.neckline, s.sleeve, s.hem, s.closure, s.weave,
  coalesce(array_length(s.photo_paths, 1), 0) as photos,
  s.photo_paths,
  s.field_sources,
  (
    select json_agg(json_build_object('service', a.service, 'ok', a.ok, 'units', a.units, 'error', a.error) order by a.id)
    from public.api_calls a
    where a.search_id = s.id
  ) as calls
from public.searches s
order by s.created_at desc
limit 3;
