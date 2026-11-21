-- Curated editorial evidence, not automatic ingestion or brand facts.
create table if not exists public.study_cases (
 id text primary key,
 user_id uuid references auth.users(id),
 account_id text,
 tags text[] not null,
 verdict text not null check (verdict in ('failure','qualified_success')),
 excerpt text not null check (length(excerpt) <= 1200),
 reason text not null,
 principle text not null,
 assessment text not null check (assessment in ('model','human_approved')),
 outcome text not null check (outcome in ('observed_failure','observed_qualified_success','correction_unvalidated','verified_correction')),
 provenance jsonb not null,
 check ((user_id is null) = (account_id is null)),
 check (verdict <> 'failure' or outcome not in ('observed_qualified_success','verified_correction'))
);
alter table public.study_cases enable row level security;
revoke all on public.study_cases from public, anon, authenticated;
grant select, insert, update, delete on public.study_cases to service_role;

-- ponytail: curated small collection, exact tag overlap; no vector service needed.
create or replace function public.retrieve_study_cases(p_user_id uuid, p_account_id text, query_text text)
returns table(id text, verdict text, excerpt text, reason text, principle text, assessment text, outcome text)
language sql stable security invoker set search_path = public
as $$
 with eligible as (
   select c.*, (select count(*) from unnest(c.tags) tag where strpos(lower(left(coalesce(query_text,''),6000)),lower(tag)) > 0) score
   from public.study_cases c
   where exists (select 1 from public.instagram_connections i where i.user_id = p_user_id and i.instagram_user_id = p_account_id)
     and ((c.user_id is null and c.account_id is null) or (c.user_id = p_user_id and c.account_id = p_account_id))
 )
 select id, verdict, excerpt, reason, principle, assessment, outcome from eligible
 where score > 0 order by score desc, id limit 2;
$$;
revoke all on function public.retrieve_study_cases(uuid,text,text) from public, anon, authenticated;
grant execute on function public.retrieve_study_cases(uuid,text,text) to service_role;
notify pgrst, 'reload schema';
