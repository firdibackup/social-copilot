-- Purchase snapshots stay immutable. Upgrades replace only the entitlement on the purchased terms.
alter table public.payments add column entitlement_plan jsonb,
  add column kind text not null default 'subscription' check (kind in ('subscription', 'upgrade')),
  add column fulfillment_error text;
alter table public.payments drop constraint payments_check;
alter table public.payments add constraint payments_period_check check (
  status <> 'paid' or (kind = 'upgrade' and period_start is null and period_end is null)
  or coalesce(period_end > period_start, false)
);

-- Reserve one payable checkout per user. This also serializes renewals against upgrades.
create function public.prepare_billing_checkout(p_user uuid, p_snapshot jsonb, p_key text, p_expires timestamptz)
returns public.payments language plpgsql set search_path = '' as $$
declare v_row public.payments; v_term public.payments; v_line jsonb; v_kind text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select * into v_row from public.payments where user_id = p_user and status = 'pending'
    and expires_at > now() order by created_at desc limit 1;
  if found then
    if v_row.checkout_key = p_key then return v_row; end if;
    raise exception 'checkout_pending';
  end if;
  if not exists (select 1 from public.billing_catalog where id and version = (p_snapshot->>'version')::integer) then
    raise exception 'catalog_changed';
  end if;
  v_kind := coalesce(p_snapshot->>'kind', 'subscription');
  if v_kind = 'upgrade' then
    if jsonb_array_length(p_snapshot->'terms') = 0 or
      (select count(*) from public.payments where user_id = p_user and status = 'paid' and period_end > now())
        <> jsonb_array_length(p_snapshot->'terms') then
      raise exception 'subscription_changed';
    end if;
    for v_line in select value from jsonb_array_elements(p_snapshot->'terms') loop
      select * into v_term from public.payments where id = (v_line->>'id')::uuid and user_id = p_user and status = 'paid' for update;
      if not found or v_term.period_start <> (v_line->>'start')::timestamptz
        or v_term.period_end <> (v_line->>'end')::timestamptz
        or coalesce(v_term.entitlement_plan, v_term.snapshot->'plan') is distinct from v_line->'from' then
        raise exception 'subscription_changed';
      end if;
    end loop;
  end if;
  update public.payments set checkout_key = null where user_id = p_user and status = 'pending' and expires_at <= now();
  insert into public.payments(user_id, amount, snapshot, checkout_key, expires_at, kind)
    values (p_user, (p_snapshot->>'total')::integer, p_snapshot, p_key, p_expires, v_kind) returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.prepare_billing_checkout(uuid,jsonb,text,timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_billing_checkout(uuid,jsonb,text,timestamptz) to service_role;

create or replace function public.activate_payment(p_id uuid, p_days integer)
returns boolean language plpgsql set search_path = '' as $$
declare v_payment public.payments; v_start timestamptz; v_end timestamptz;
  v_line jsonb; v_term public.payments; v_conflict boolean := false;
begin
  select * into v_payment from public.payments where id = p_id;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_payment.user_id::text, 0));
  select * into v_payment from public.payments where id = p_id for update;
  if v_payment.status = 'paid' then return false; end if;
  if v_payment.kind = 'upgrade' then
    -- A late webhook applies the exact purchased terms. Never silently extend access or reset usage.
    for v_line in select value from jsonb_array_elements(v_payment.snapshot->'terms') loop
      select * into v_term from public.payments where id = (v_line->>'id')::uuid
        and user_id = v_payment.user_id and status = 'paid' for update;
      if not found or v_term.period_start <> (v_line->>'start')::timestamptz
        or v_term.period_end <> (v_line->>'end')::timestamptz
        or coalesce(v_term.entitlement_plan, v_term.snapshot->'plan') is distinct from v_line->'from' then
        v_conflict := true;
      end if;
    end loop;
    if not v_conflict then
      update public.payments set entitlement_plan = v_payment.snapshot->'plan'
        where user_id = v_payment.user_id and id in (
          select (value->>'id')::uuid from jsonb_array_elements(v_payment.snapshot->'terms')
        );
    end if;
    update public.payments set status = 'paid', paid_at = now(),
      fulfillment_error = case when v_conflict then 'subscription_changed' else null end where id = p_id;
    return not v_conflict;
  end if;
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

-- Admin uses the effective entitlement too; the original invoice snapshot is retained.
create or replace function public.billing_admin_overview(p_user_id uuid default null)
returns table(user_id uuid, active_until timestamptz, period_start timestamptz, period_end timestamptz, credits_used integer, credits_total integer, plan_name text)
language sql stable set search_path = '' as $$
  with users as (
    select p.user_id, max(p.period_end) as active_until from public.payments p
    where p.status = 'paid' and (p_user_id is null or p.user_id = p_user_id) group by p.user_id
  ), current as (
    select u.*, p.period_start as anchor, p.period_end as term_end, p.snapshot,
      coalesce(p.entitlement_plan, p.snapshot->'plan') as plan,
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
    (plan->>'credits')::integer, plan->>'name' from bounds;
$$;
