-- Admin: app-wide settings (AI models, the plan), credit adjustments per user, and a log of what admins did.
-- Admins are the emails in ADMIN_EMAILS; there is no role column. Same rules as the other tables: RLS on with no
-- policies, so only the server's service-role key can read or write.

-- One row. Null columns fall back to the defaults in code (ROUTER_MODEL, ROUTER_IMAGE_MODEL, DEFAULT_PLAN).
create table public.app_settings (
  id             boolean primary key default true check (id),
  text_model     text,
  image_model    text,
  plan_name      text,
  plan_price_idr integer check (plan_price_idr >= 0),
  plan_days      integer check (plan_days between 1 and 366),
  plan_credits   integer check (plan_credits > 0),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null
);

-- Credits an admin gave back (positive) or took away (negative). credits_used() subtracts them, so they count in
-- the period they were made in, like requests.
create table public.credit_adjustments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  amount     integer not null check (amount <> 0),
  note       text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index credit_adjustments_user_id_created_at_idx on public.credit_adjustments (user_id, created_at desc);

-- What admins did. The target keeps no foreign key, so the log outlives a deleted user.
create table public.admin_log (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid references auth.users (id) on delete set null,
  target_user_id uuid,
  target_email   text,
  action         text not null,
  detail         jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index admin_log_created_at_idx on public.admin_log (created_at desc);

-- Requests minus adjustments. It can go below zero after a bonus, which leaves more than the plan's credits.
create or replace function public.credits_used(p_user_id uuid, p_since timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select (
    coalesce((select sum(credits) from public.ai_generations where user_id = p_user_id and created_at >= p_since), 0)
    - coalesce((select sum(amount) from public.credit_adjustments where user_id = p_user_id and created_at >= p_since), 0)
  )::integer;
$$;

-- Every user with a paid period: when the last one ends, and the current one with its credits spent (null without
-- one). p_user_id narrows it to one user.
create function public.admin_user_overview(p_user_id uuid default null)
returns table (user_id uuid, active_until timestamptz, period_start timestamptz, period_end timestamptz, credits_used integer)
language sql
stable
set search_path = ''
as $$
  select last.user_id, last.active_until, cur.period_start, cur.period_end,
         case when cur.period_start is null then null else public.credits_used(last.user_id, cur.period_start) end
    from (
      select p.user_id, max(p.period_end) as active_until
        from public.payments p
       where p.status = 'paid' and (p_user_id is null or p.user_id = p_user_id)
       group by p.user_id
    ) last
    left join lateral (
      select p.period_start, p.period_end
        from public.payments p
       where p.user_id = last.user_id and p.status = 'paid' and p.period_start <= now() and p.period_end > now()
       order by p.period_start desc
       limit 1
    ) cur on true;
$$;

-- AI requests since p_since per model.
create function public.admin_ai_usage(p_since timestamptz)
returns table (model text, requests integer, failed integer, credits integer, users integer)
language sql
stable
set search_path = ''
as $$
  select model, count(*)::integer, (count(*) filter (where status = 'failed'))::integer,
         coalesce(sum(credits), 0)::integer, count(distinct user_id)::integer
    from public.ai_generations
   where created_at >= p_since
   group by model
   order by count(*) desc;
$$;

-- Ends the user's subscription now: the current period stops, and periods paid ahead are cancelled (kept as
-- 'expired' rows for the record). Returns how many rows changed.
create function public.admin_end_subscription(p_user_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_ahead   integer;
  v_current integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update public.payments set status = 'expired'
   where user_id = p_user_id and status = 'paid' and period_start > now();
  get diagnostics v_ahead = row_count;
  update public.payments set period_end = now()
   where user_id = p_user_id and status = 'paid' and period_start < now() and period_end > now();
  get diagnostics v_current = row_count;
  return v_ahead + v_current;
end;
$$;

alter table public.app_settings enable row level security;
alter table public.credit_adjustments enable row level security;
alter table public.admin_log enable row level security;

revoke all on public.app_settings, public.credit_adjustments, public.admin_log from anon, authenticated;
revoke execute on function public.admin_user_overview(uuid) from public, anon, authenticated;
revoke execute on function public.admin_ai_usage(timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_end_subscription(uuid) from public, anon, authenticated;
grant execute on function public.admin_user_overview(uuid) to service_role;
grant execute on function public.admin_ai_usage(timestamptz) to service_role;
grant execute on function public.admin_end_subscription(uuid) to service_role;
