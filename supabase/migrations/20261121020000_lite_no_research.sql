-- Lite is sold without Intel Kompetitor (riset langsung Instagram via Apify); Pro and Max keep it and also get the
-- image queue's top tier ("2x lebih cepat generate gambar").

-- The catalog: Lite gets researchDaily 0. Idempotent: only the plan with id 'lite' changes.
update public.billing_catalog
set version = version + 1, updated_at = now(),
    config = jsonb_set(config, '{plans}', (
      select jsonb_agg(case when plan->>'id' = 'lite' then plan || '{"researchDaily":0}'::jsonb else plan end order by ord)
      from jsonb_array_elements(config->'plans') with ordinality as p(plan, ord)
    ))
where id and exists (
  select 1 from jsonb_array_elements(config->'plans') plan
  where plan->>'id' = 'lite' and plan->'researchDaily' is distinct from '0'::jsonb
);

-- Payments keep the plan as bought (snapshot.plan, immutable), so Lite terms still carry researchDaily 3. The
-- entitlement (entitlement_plan, read before the snapshot everywhere) drops research for every Lite term still
-- running or yet to start. Lite checkouts not paid yet get it too, so a link paid after this still has no research.
update public.payments
set entitlement_plan = coalesce(entitlement_plan, snapshot->'plan') || '{"researchDaily":0}'::jsonb
where coalesce(entitlement_plan, snapshot->'plan')->>'id' = 'lite'
  and coalesce(entitlement_plan, snapshot->'plan')->'researchDaily' is distinct from '0'::jsonb
  and ((status = 'paid' and period_end > now()) or (status <> 'paid' and kind = 'subscription'));

-- Prioritas proses: Pro and Max first, then Lite, then the trial; FIFO within each tier.
-- ponytail: the tier is the plan id 'lite'; a plan flag if the catalog grows more priority plans.
create or replace function public.claim_content_job() returns setof public.content_jobs
language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  update public.content_jobs set status = 'failed', error = 'Proses terhenti berulang kali. Klik Coba lagi.', lease = null
    where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts >= 3;
  select j.post_id into v_id from public.content_jobs j
    left join lateral (
      -- Legacy plans have no id: still paid, so Pro's tier.
      select case when coalesce(p.entitlement_plan, p.snapshot->'plan')->>'id' = 'lite' then 1 else 0 end as tier
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
      select case when coalesce(p.entitlement_plan, p.snapshot->'plan')->>'id' = 'lite' then 1 else 0 end as tier
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
