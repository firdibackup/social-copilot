-- Langganan: prepaid 30-day periods paid through Mayar, and monthly AI credits. A subscription is not a table of
-- its own: a user is active while a paid payment's period covers now, so there is no second status to drift.
-- Same rules as the other tables: RLS on with no policies, so only the server's service-role key can read or write.

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  mayar_id     text unique,  -- Mayar's Single Payment Request id; null for a period granted by hand
  link         text,         -- Mayar's checkout page
  amount       integer not null check (amount >= 0),
  status       text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  expires_at   timestamptz,  -- when the Mayar link stops accepting payment
  period_start timestamptz,
  period_end   timestamptz,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  check (status <> 'paid' or coalesce(period_end > period_start, false)) -- a NULL comparison would pass a CHECK
);

create index payments_user_id_period_end_idx on public.payments (user_id, period_end desc);

-- What each AI request cost; failed requests cost nothing.
alter table public.ai_generations add column credits smallint not null default 0 check (credits >= 0);

-- Turns a pending payment into the next period: it starts when the user's last paid period ends, or now, so
-- paying early adds days instead of losing them. Only the first call wins, and the advisory lock keeps two
-- payments of one user from computing the same start.
create function public.activate_payment(p_id uuid, p_days integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_user  uuid;
  v_start timestamptz;
begin
  select user_id into v_user from public.payments where id = p_id and status = 'pending';
  if not found then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select greatest(now(), coalesce(max(period_end), now())) into v_start
    from public.payments
   where user_id = v_user and status = 'paid';

  update public.payments
     set status = 'paid', paid_at = now(), period_start = v_start, period_end = v_start + make_interval(days => p_days)
   where id = p_id and status = 'pending';
  return found;
end;
$$;

-- Credits a user spent since `p_since`, the start of their current period.
create function public.credits_used(p_user_id uuid, p_since timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(credits), 0)::integer
    from public.ai_generations
   where user_id = p_user_id and created_at >= p_since;
$$;

-- The owner (the first auth user, as in the multi-user migration) keeps using the app without paying.
-- Other free accounts get the same row, inserted by hand in Studio.
insert into public.payments (user_id, amount, status, period_start, period_end, paid_at)
select id, 0, 'paid', now(), '2099-12-31', now() from auth.users order by created_at limit 1;

alter table public.payments enable row level security;

revoke all on public.payments from anon, authenticated;
revoke execute on function public.activate_payment(uuid, integer) from public, anon, authenticated;
revoke execute on function public.credits_used(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.activate_payment(uuid, integer) to service_role;
grant execute on function public.credits_used(uuid, timestamptz) to service_role;
