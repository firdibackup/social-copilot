create table public.billing_catalog (
  id boolean primary key default true check (id), version integer not null default 1,
  config jsonb not null, updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.billing_catalog enable row level security;
revoke all on public.billing_catalog from anon, authenticated;
grant all on public.billing_catalog to service_role;
insert into public.billing_catalog(config) values ('{
  "plans": [
    {"id":"pro","name":"Pro","priceIdr":139000,"days":30,"credits":2500,"active":true,"description":"Untuk rutin membuat dan menjadwalkan konten.","chatDaily":100,"researchDaily":5,"prioritySupport":false,"earlyAccess":false},
    {"id":"max","name":"Max","priceIdr":349000,"days":30,"credits":12500,"active":true,"description":"Lebih banyak ruang untuk produksi dan riset konten.","chatDaily":200,"researchDaily":10,"prioritySupport":true,"earlyAccess":true}
  ],
  "durations":[{"months":1,"discount":0},{"months":3,"discount":5},{"months":6,"discount":11},{"months":12,"discount":17}],
  "rates":{"image":20,"content":3,"content_slide":0,"slide_edit":20,"caption_edit":2,"content_ideas":2,"content_script":3,"brand_profile":5,"brand_visual":10,"brand_strategy":5,"website_catalog":10,"asset_tags":1,"reply_draft":1,"template_analysis":0,"chat":0,"deep_search":0,"chat_summary":0},
  "supportUrl":"","supportHours":""
}');
alter table public.payments add column snapshot jsonb, add column checkout_key text, add column mayar_transaction_id text,
  add column last_checked_at timestamptz;
create unique index payments_checkout_key_unique on public.payments(checkout_key) where status = 'pending';
update public.payments set snapshot = jsonb_build_object('legacy', true, 'plan', jsonb_build_object(
  'name', coalesce((select plan_name from public.app_settings limit 1), 'Carousely 30 hari'),
  'priceIdr', coalesce((select plan_price_idr from public.app_settings limit 1), 99000),
  'days', coalesce((select plan_days from public.app_settings limit 1), 30),
  'credits', coalesce((select plan_credits from public.app_settings limit 1), 10000),
  'chatDaily', 100, 'researchDaily', 10, 'prioritySupport', false, 'earlyAccess', false
));
create function public.save_billing_catalog(p_admin uuid, p_version integer, p_config jsonb)
returns boolean language plpgsql set search_path = '' as $$
declare v_before jsonb;
begin
  select config into v_before from public.billing_catalog where id and version = p_version for update;
  if not found then return false; end if;
  update public.billing_catalog set config = p_config, version = version + 1, updated_at = now(), updated_by = p_admin where id;
  insert into public.admin_log(admin_id, action, detail)
    values(p_admin, 'billing_catalog', jsonb_build_object('before', v_before, 'after', p_config, 'version', p_version + 1));
  return true;
end $$;
create or replace function public.activate_payment(p_id uuid, p_days integer)
returns boolean language plpgsql set search_path = '' as $$
declare v_payment public.payments; v_start timestamptz; v_end timestamptz;
begin
  select * into v_payment from public.payments where id = p_id;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_payment.user_id::text, 0));
  select * into v_payment from public.payments where id = p_id for update;
  if v_payment.status = 'paid' then return false; end if;
  select greatest(now(), coalesce(max(period_end), now())) into v_start
    from public.payments where user_id = v_payment.user_id and status = 'paid';
  if v_payment.snapshot ? 'months' then
    v_end := ((v_start at time zone 'UTC') + make_interval(months => (v_payment.snapshot->>'months')::integer)) at time zone 'UTC';
  else
    v_end := v_start + make_interval(days => coalesce((v_payment.snapshot->'plan'->>'days')::integer, p_days));
  end if;
  if v_end <= v_start then raise exception 'invalid_period'; end if;
  update public.payments set status = 'paid', paid_at = now(), period_start = v_start, period_end = v_end where id = p_id;
  return true;
end $$;
revoke execute on function public.save_billing_catalog(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_billing_catalog(uuid,integer,jsonb) to service_role;

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_start timestamptz not null,
  cost integer not null check(cost >= 0),
  status text not null default 'reserved' check(status in ('reserved','charged','released')),
  created_at timestamptz not null default now()
);
create index credit_reservations_user_cycle on public.credit_reservations(user_id, cycle_start);
alter table public.credit_reservations enable row level security;
revoke all on public.credit_reservations from anon, authenticated;
grant all on public.credit_reservations to service_role;
alter table public.ai_generations add column reservation_id uuid unique references public.credit_reservations(id),
  alter column credits type integer;

create or replace function public.credits_used(p_user_id uuid, p_since timestamptz)
returns integer language sql stable set search_path = '' as $$
  select (
    coalesce((select sum(credits) from public.ai_generations where user_id = p_user_id and created_at >= p_since and reservation_id is null), 0)
    + coalesce((select sum(cost) from public.credit_reservations where user_id = p_user_id and cycle_start >= p_since and status <> 'released'), 0)
    - coalesce((select sum(amount) from public.credit_adjustments where user_id = p_user_id and created_at >= p_since), 0)
  )::integer;
$$;
create function public.reserve_ai_credits(p_user uuid, p_since timestamptz, p_until timestamptz, p_allowance integer, p_cost integer)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  if p_cost < 0 or p_allowance < 0 then raise exception 'invalid_cost'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if now() < p_since or now() >= p_until or not exists (
    select 1 from public.payments where user_id = p_user and status = 'paid' and period_start <= now() and period_end > now()
  ) then return null; end if;
  if public.credits_used(p_user, p_since) + p_cost > p_allowance then return null; end if;
  insert into public.credit_reservations(user_id, cycle_start, cost) values(p_user, p_since, p_cost) returning id into v_id;
  return v_id;
end $$;
create function public.settle_ai_credits(p_id uuid, p_user uuid, p_success boolean)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  update public.credit_reservations set status = case when p_success then 'charged' else 'released' end
    where id = p_id and user_id = p_user and status = 'reserved';
end $$;
revoke execute on function public.reserve_ai_credits(uuid,timestamptz,timestamptz,integer,integer), public.settle_ai_credits(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.reserve_ai_credits(uuid,timestamptz,timestamptz,integer,integer), public.settle_ai_credits(uuid,uuid,boolean) to service_role;

create function public.billing_admin_overview(p_user_id uuid default null)
returns table(user_id uuid, active_until timestamptz, period_start timestamptz, period_end timestamptz, credits_used integer, credits_total integer, plan_name text)
language sql stable set search_path = '' as $$
  with users as (
    select p.user_id, max(p.period_end) as active_until from public.payments p
    where p.status = 'paid' and (p_user_id is null or p.user_id = p_user_id) group by p.user_id
  ), current as (
    select u.*, p.period_start as anchor, p.period_end as term_end, p.snapshot,
      case when p.snapshot ? 'months' then
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
    select *, case when snapshot ? 'months' then ((anchor at time zone 'UTC') + make_interval(months => m)) at time zone 'UTC' else anchor end as cycle_start,
      case when snapshot ? 'months' then least(term_end, ((anchor at time zone 'UTC') + make_interval(months => m + 1)) at time zone 'UTC') else term_end end as cycle_end
    from cycle
  )
  select user_id, active_until, cycle_start, cycle_end,
    case when cycle_start is null then null else public.credits_used(user_id, cycle_start) end,
    (snapshot->'plan'->>'credits')::integer, snapshot->'plan'->>'name' from bounds;
$$;
revoke execute on function public.billing_admin_overview(uuid) from public, anon, authenticated;
grant execute on function public.billing_admin_overview(uuid) to service_role;

-- Return a failed research slot to its original WIB day, including requests crossing midnight.
create function public.reserve_billing_daily_usage(p_user_id uuid, p_task text, p_limit integer)
returns date language plpgsql set search_path = '' as $$
begin
  if public.reserve_sigap_daily_usage(p_user_id, p_task, p_limit) then
    return (current_timestamp at time zone 'Asia/Jakarta')::date;
  end if;
  return null;
end $$;
revoke execute on function public.reserve_billing_daily_usage(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_billing_daily_usage(uuid,text,integer) to service_role;
create function public.release_sigap_daily_usage(p_user_id uuid, p_task text, p_day date)
returns void language plpgsql set search_path = '' as $$
declare v_used integer;
begin
  select used into v_used from public.sigap_daily_usage
    where user_id = p_user_id and task = p_task and day = p_day for update;
  if not found then return; end if;
  if v_used = 1 then
    delete from public.sigap_daily_usage where user_id = p_user_id and task = p_task and day = p_day;
  else
    update public.sigap_daily_usage set used = used - 1 where user_id = p_user_id and task = p_task and day = p_day;
  end if;
end $$;
revoke execute on function public.release_sigap_daily_usage(uuid,text,date) from public, anon, authenticated;
grant execute on function public.release_sigap_daily_usage(uuid,text,date) to service_role;
