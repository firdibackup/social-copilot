-- Free trial for users without a paid period: 3 credits once (one new AI carousel, "1 konten = 3 kredit") and
-- 3 Mimo messages in total. Neither ever resets.
--
-- Trial credits are credit_reservations rows on a fixed cycle_start (the epoch). No paid cycle starts there, so
-- credits_used() for a paid period never counts them, and settle_ai_credits() settles them unchanged.
create function public.trial_credits_used(p_user uuid)
returns integer language sql stable set search_path = '' as $$
  select coalesce(sum(cost), 0)::integer from public.credit_reservations
    where user_id = p_user and cycle_start = 'epoch'::timestamptz and status <> 'released';
$$;

create function public.reserve_trial_credits(p_user uuid, p_allowance integer, p_cost integer)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  if p_cost < 0 or p_allowance < 0 then raise exception 'invalid_cost'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  -- A paying user spends their plan's credits (reserve_ai_credits), never the trial.
  if exists (
    select 1 from public.payments where user_id = p_user and status = 'paid' and period_start <= now() and period_end > now()
  ) then return null; end if;
  if public.trial_credits_used(p_user) + p_cost > p_allowance then return null; end if;
  insert into public.credit_reservations(user_id, cycle_start, cost) values(p_user, 'epoch'::timestamptz, p_cost) returning id into v_id;
  return v_id;
end $$;

-- ponytail: the trial's lifetime chat count is the sigap_daily_usage row on the epoch day; no WIB day is ever that
-- old, so paid daily limits never see it. A table of its own if the trial grows more counters.
create function public.reserve_trial_chat(p_user_id uuid, p_limit integer)
returns date language plpgsql set search_path = '' as $$
declare v_reserved integer;
begin
  if p_limit < 1 then raise exception 'invalid trial chat limit'; end if;
  insert into public.sigap_daily_usage (user_id, day, task, used)
  values (p_user_id, '1970-01-01'::date, 'chat', 1)
  on conflict (user_id, day, task) do update
    set used = public.sigap_daily_usage.used + 1
    where public.sigap_daily_usage.used < p_limit
  returning used into v_reserved;
  if v_reserved is null then return null; end if;
  return '1970-01-01'::date;
end $$;

revoke execute on function public.trial_credits_used(uuid), public.reserve_trial_credits(uuid,integer,integer),
  public.reserve_trial_chat(uuid,integer) from public, anon, authenticated;
grant execute on function public.trial_credits_used(uuid), public.reserve_trial_credits(uuid,integer,integer),
  public.reserve_trial_chat(uuid,integer) to service_role;

-- Prioritas proses: Max first, then other paid plans, then the trial; FIFO within each tier.
-- ponytail: the tier is the plan id 'max'; a plan flag if the catalog grows more priority plans.
create or replace function public.claim_content_job() returns setof public.content_jobs
language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  update public.content_jobs set status = 'failed', error = 'Proses terhenti berulang kali. Klik Coba lagi.', lease = null
    where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts >= 3;
  select j.post_id into v_id from public.content_jobs j
    left join lateral (
      -- Legacy plans have no id: still paid, so Pro's tier.
      select case when coalesce(p.entitlement_plan, p.snapshot->'plan')->>'id' = 'max' then 0 else 1 end as tier
      from public.payments p
      where p.user_id = j.user_id and p.status = 'paid' and p.period_start <= now() and p.period_end > now()
      order by p.period_start limit 1
    ) paid on true
    where j.status = 'pending' or (j.status = 'running' and j.claimed_at < now() - interval '10 minutes' and j.attempts < 3)
    order by coalesce(paid.tier, 2), j.created_at
    for update of j skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.content_jobs set status = 'running', lease = gen_random_uuid(),
    claimed_at = now(), attempts = attempts + 1 where post_id = v_id returning *;
end $$;

-- The same tiers for the slide image queue. Slide edits (slide_edit_jobs) run inline in the request, unqueued.
create or replace function public.claim_next_slide()
returns setof public.post_slides language sql set search_path = '' as $$
  update public.post_slides set status = 'generating', lease = gen_random_uuid(), claimed_at = now(),
    attempt_count = attempt_count + 1, updated_at = now()
  where id = (
    select s.id from public.post_slides s
    left join lateral (
      -- Legacy plans have no id: still paid, so Pro's tier.
      select case when coalesce(p.entitlement_plan, p.snapshot->'plan')->>'id' = 'max' then 0 else 1 end as tier
      from public.payments p
      where p.user_id = s.user_id and p.status = 'paid' and p.period_start <= now() and p.period_end > now()
      order by p.period_start limit 1
    ) paid on true
    where ((s.status = 'pending' and coalesce(s.next_attempt_at, s.created_at) <= now())
      or (s.status = 'generating' and s.claimed_at < now() - interval '5 minutes'))
    and not exists (
      select 1 from public.post_slides e where e.post_id = s.post_id and e.id <> s.id
        and ((e.status = 'generating' and e.claimed_at >= now() - interval '5 minutes')
          or (e.position < s.position and e.status in ('pending', 'generating')))
    )
    order by coalesce(paid.tier, 2),
      coalesce(s.next_attempt_at, s.created_at), s.position
    limit 1 for update of s skip locked
  ) returning *;
$$;
