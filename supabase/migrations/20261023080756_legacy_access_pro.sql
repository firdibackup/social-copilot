-- Existing access becomes Pro without inventing a payment or extending its paid term.
-- Only legacy periods of currently active users are converted, including access paid ahead.
do $$
declare v_plan jsonb; v_version integer;
begin
  select c.version, p.value into v_version, v_plan
    from public.billing_catalog c cross join lateral jsonb_array_elements(c.config->'plans') p
    where c.id and p.value->>'id' = 'pro';
  if v_plan is null then raise exception 'Pro plan is required before migrating legacy access'; end if;

  update public.payments p set snapshot = p.snapshot || jsonb_build_object(
    'plan', v_plan, 'version', v_version, 'monthly', true,
    'migration', 'legacy_access_pro', 'previousPlan', p.snapshot->'plan'
  )
  where p.status = 'paid' and p.period_end > now()
    and p.snapshot->>'legacy' = 'true'
    and p.snapshot->'plan'->>'id' is null
    and exists (
      select 1 from public.payments active where active.user_id = p.user_id and active.status = 'paid'
        and active.period_start <= now() and active.period_end > now()
    );
end $$;

-- Keep admin balances on the same anchored monthly cycles as getCurrentPeriod.
create or replace function public.billing_admin_overview(p_user_id uuid default null)
returns table(user_id uuid, active_until timestamptz, period_start timestamptz, period_end timestamptz, credits_used integer, credits_total integer, plan_name text)
language sql stable set search_path = '' as $$
  with users as (
    select p.user_id, max(p.period_end) as active_until from public.payments p
    where p.status = 'paid' and (p_user_id is null or p.user_id = p_user_id) group by p.user_id
  ), current as (
    select u.*, p.period_start as anchor, p.period_end as term_end, p.snapshot,
      case when p.snapshot ? 'months' or p.snapshot->>'monthly' = 'true' then
        (extract(year from now() at time zone 'UTC')::integer - extract(year from p.period_start at time zone 'UTC')::integer) * 12
        + extract(month from now() at time zone 'UTC')::integer - extract(month from p.period_start at time zone 'UTC')::integer
      else 0 end as month_index
    from users u left join lateral (
      select * from public.payments p where p.user_id = u.user_id and p.status = 'paid'
      and p.period_start <= now() and p.period_end > now() order by p.period_start limit 1
    ) p on true
  ), cycle as (
    select *, month_index - case when ((anchor at time zone 'UTC') + make_interval(months => month_index)) at time zone 'UTC' > now() then 1 else 0 end as m from current
  ), bounds as (
    select *, case when snapshot ? 'months' or snapshot->>'monthly' = 'true' then ((anchor at time zone 'UTC') + make_interval(months => m)) at time zone 'UTC' else anchor end as cycle_start,
      case when snapshot ? 'months' or snapshot->>'monthly' = 'true' then least(term_end, ((anchor at time zone 'UTC') + make_interval(months => m + 1)) at time zone 'UTC') else term_end end as cycle_end
    from cycle
  )
  select user_id, active_until, cycle_start, cycle_end,
    case when cycle_start is null then null else public.credits_used(user_id, cycle_start) end,
    (snapshot->'plan'->>'credits')::integer, snapshot->'plan'->>'name' from bounds;
$$;
