-- Free access and the new onboarding.
--
-- The trial: 2 new AI carousels at once and a third after the Instagram login, 10 Mimo messages, 2 AI revisions.
-- None of it ever resets. The database decides the content allowance, so a worker that still runs older code
-- charges the same.

-- 1. The wizard's new answers. Lengths only: the choices are validated in src/lib/onboarding-options.ts.
alter table public.onboarding
  add column ig_username text not null default '' check (char_length(ig_username) <= 30),
  -- Whether ig_username came from the Instagram login, not from what the user typed.
  add column ig_verified boolean not null default false,
  add column no_instagram boolean not null default false,
  -- What the lookup read: name, bio, followers, posts, private, verified. Never a signed image URL.
  add column ig_profile jsonb,
  -- Our own copy of the profile picture (bucket brand).
  add column avatar_path text,
  add column goal text not null default '' check (char_length(goal) <= 40),
  add column website text not null default '' check (char_length(website) <= 300),
  add column caption_language text not null default '' check (char_length(caption_language) <= 40),
  add column posts_last_month text not null default '' check (char_length(posts_last_month) <= 40),
  add column handler text not null default '' check (char_length(handler) <= 40),
  add column skill_level text not null default '' check (char_length(skill_level) <= 40),
  add column logo_choice text not null default '' check (char_length(logo_choice) <= 40),
  -- The last step the user reached, for the funnel in Admin › Onboarding.
  add column last_step text not null default '' check (char_length(last_step) <= 40),
  add column started_at timestamptz;

update public.onboarding set started_at = coalesce(completed_at, updated_at);
alter table public.onboarding alter column started_at set default now(), alter column started_at set not null;

-- Accounts connected before this migration are verified by their login.
update public.onboarding o set ig_username = lower(c.username), ig_verified = true
  from public.instagram_connections c where c.user_id = o.user_id;

create index onboarding_ig_username on public.onboarding (lower(ig_username)) where ig_username <> '';

-- 2. Profiles read by username (Apify), kept a day so a retyped username costs nothing.
create table public.instagram_lookups (
  username text primary key check (username ~ '^[a-z0-9._]{1,30}$'),
  status text not null check (status in ('ok', 'private', 'not_found')),
  profile jsonb,
  avatar_path text,
  fetched_at timestamptz not null default now()
);
alter table public.instagram_lookups enable row level security;
revoke all on public.instagram_lookups from anon, authenticated;
grant all on public.instagram_lookups to service_role;

-- 3. What users did on the way: onboarding steps, lookups, paywalls shown and clicked. Admin › Onboarding reads it.
create table public.funnel_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null check (char_length(event) between 1 and 40),
  detail text not null default '' check (char_length(detail) <= 100),
  created_at timestamptz not null default now()
);
create index funnel_events_user on public.funnel_events (user_id, event, created_at);
create index funnel_events_event on public.funnel_events (event, created_at);
alter table public.funnel_events enable row level security;
revoke all on public.funnel_events from anon, authenticated;
grant all on public.funnel_events to service_role;

-- 4. The trial's counters besides content and chat: AI revisions today.
create table public.trial_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null check (char_length(task) between 1 and 40),
  used integer not null check (used > 0),
  primary key (user_id, task)
);
alter table public.trial_usage enable row level security;
revoke all on public.trial_usage from anon, authenticated;
grant all on public.trial_usage to service_role;

create function public.reserve_trial_use(p_user_id uuid, p_task text, p_limit integer)
returns boolean language plpgsql set search_path = '' as $$
declare v_used integer;
begin
  if p_limit < 1 then return false; end if;
  insert into public.trial_usage (user_id, task, used) values (p_user_id, p_task, 1)
  on conflict (user_id, task) do update set used = public.trial_usage.used + 1
    where public.trial_usage.used < p_limit
  returning used into v_used;
  return v_used is not null;
end $$;

-- A reserved use whose request failed goes back.
create function public.release_trial_use(p_user_id uuid, p_task text)
returns void language plpgsql set search_path = '' as $$
begin
  delete from public.trial_usage where user_id = p_user_id and task = p_task and used <= 1;
  if not found then
    update public.trial_usage set used = used - 1 where user_id = p_user_id and task = p_task;
  end if;
end $$;

-- 5. Content. A carousel costs 3 trial credits, as before; the allowance is 2 carousels, 3 with a real Instagram
-- login. The account before that login is a placeholder connection whose id starts with 'pra-'.
alter table public.app_settings add column trial_daily_contents integer not null default 60 check (trial_daily_contents >= 0);

create function public.trial_content_allowance(p_user uuid)
returns integer language sql stable set search_path = '' as $$
  select 3 * (2 + case when exists (
    select 1 from public.instagram_connections c where c.user_id = p_user and c.instagram_user_id not like 'pra-%'
  ) then 1 else 0 end);
$$;

-- One Instagram username gets the trial once: its use is counted over every user who claims it. A user who
-- proved the account by logging in is counted only with others who proved it, so a stranger typing the username
-- cannot take the owner's trial.
create or replace function public.trial_credits_used(p_user uuid)
returns integer language sql stable set search_path = '' as $$
  with me as (
    select lower(ig_username) as username, ig_verified from public.onboarding where user_id = p_user and ig_username <> ''
  ), pool as (
    select p_user as user_id
    union
    select o.user_id from public.onboarding o, me
      where lower(o.ig_username) = me.username and (o.ig_verified or not me.ig_verified)
  )
  select coalesce(sum(r.cost), 0)::integer from public.credit_reservations r
    where r.user_id in (select user_id from pool) and r.cycle_start = 'epoch'::timestamptz and r.status <> 'released';
$$;

-- p_allowance stays for callers deployed before this migration and is no longer read: the allowance is decided
-- here. Also stops at app_settings.trial_daily_contents free carousels a day over all users.
create or replace function public.reserve_trial_credits(p_user uuid, p_allowance integer, p_cost integer)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid; v_daily integer;
begin
  if p_cost < 0 or p_allowance < 0 then raise exception 'invalid_cost'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  -- A paying user spends their plan's credits (reserve_ai_credits), never the trial.
  if exists (
    select 1 from public.payments where user_id = p_user and status = 'paid' and period_start <= now() and period_end > now()
  ) then return null; end if;
  if public.trial_credits_used(p_user) + p_cost > public.trial_content_allowance(p_user) then return null; end if;
  select trial_daily_contents into v_daily from public.app_settings limit 1;
  if (
    select count(*) from public.credit_reservations
      where cycle_start = 'epoch'::timestamptz and status <> 'released' and created_at > now() - interval '24 hours'
  ) >= coalesce(v_daily, 60) then return null; end if;
  insert into public.credit_reservations(user_id, cycle_start, cost) values(p_user, 'epoch'::timestamptz, p_cost) returning id into v_id;
  return v_id;
end $$;

-- What is left of the trial, for the meter in the app.
create function public.trial_status(p_user uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'content_limit', public.trial_content_allowance(p_user) / 3,
    'content_used', least(public.trial_credits_used(p_user), public.trial_content_allowance(p_user)) / 3,
    'chat_used', coalesce((
      select used from public.sigap_daily_usage where user_id = p_user and day = '1970-01-01'::date and task = 'chat'
    ), 0),
    'revision_used', coalesce((select used from public.trial_usage where user_id = p_user and task = 'revision'), 0),
    'connected', public.trial_content_allowance(p_user) > 6
  );
$$;

-- 6. The Instagram login of a user who started without it: everything made under the placeholder account moves to
-- the real one. A table where the real account already has that row keeps its own.
create function public.adopt_provisional_account(p_user_id uuid, p_from text, p_to text)
returns void language plpgsql set search_path = '' as $$
declare v_table text;
begin
  if p_from not like 'pra-%' or p_to like 'pra-%' then return; end if;
  for v_table in
    select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'account_id' and t.table_type = 'BASE TABLE'
        and exists (
          select 1 from information_schema.columns u
            where u.table_schema = 'public' and u.table_name = c.table_name and u.column_name = 'user_id'
        )
  loop
    begin
      execute format('update public.%I set account_id = $1 where user_id = $2 and account_id = $3', v_table)
        using p_to, p_user_id, p_from;
    exception when unique_violation then
      null;
    end;
  end loop;
end $$;

revoke execute on function public.reserve_trial_use(uuid,text,integer), public.release_trial_use(uuid,text),
  public.trial_content_allowance(uuid), public.trial_status(uuid), public.adopt_provisional_account(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.reserve_trial_use(uuid,text,integer), public.release_trial_use(uuid,text),
  public.trial_content_allowance(uuid), public.trial_status(uuid), public.adopt_provisional_account(uuid,text,text)
  to service_role;
