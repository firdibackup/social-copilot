-- Keep engineering evidence private and searchable for audits, not writer examples.
create or replace function public.retrieve_study_cases(p_user_id uuid, p_account_id text, query_text text)
returns table(id text, verdict text, excerpt text, reason text, principle text, assessment text, outcome text)
language sql stable security invoker set search_path = public
as $$
 with eligible as (
   select c.*, (select count(*) from unnest(c.tags) tag where strpos(lower(left(coalesce(query_text,''),6000)),lower(tag)) > 0) score
   from public.study_cases c
   where exists (select 1 from public.instagram_connections i where i.user_id = p_user_id and i.instagram_user_id = p_account_id)
     and ((c.user_id is null and c.account_id is null) or (c.user_id = p_user_id and c.account_id = p_account_id))
     and coalesce(c.provenance->>'kind', '') <> 'engineering_diagnostic_not_writer_exemplar'
 )
 select id, verdict, excerpt, reason, principle, assessment, outcome from eligible
 where score > 0 order by score desc, id limit 2;
$$;
revoke all on function public.retrieve_study_cases(uuid,text,text) from public, anon, authenticated;
grant execute on function public.retrieve_study_cases(uuid,text,text) to service_role;
notify pgrst, 'reload schema';
