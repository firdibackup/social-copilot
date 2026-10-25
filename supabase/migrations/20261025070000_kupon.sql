-- Kupon: a code an admin hands out for a percent off a subscription checkout. A coupon has no usage counter of its
-- own: a use is a payment that carries it and is paid, or still pending with a payable link. An expired or failed
-- checkout gives its use back, so the count can't drift from the payments it describes.
create table public.coupons (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  percent     integer not null check (percent between 1 and 100),
  max_uses    integer not null check (max_uses between 1 and 1000000),
  active      boolean not null default true,
  expires_at  timestamptz,
  -- Empty means every plan / every duration.
  plan_ids    text[] not null default '{}',
  months      integer[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);
alter table public.coupons enable row level security;
revoke all on public.coupons from anon, authenticated;
grant all on public.coupons to service_role;

-- A coupon that was used can't be deleted, only switched off.
alter table public.payments add column coupon_id uuid references public.coupons (id) on delete restrict;
create index payments_coupon_idx on public.payments (coupon_id, user_id) where coupon_id is not null;

-- Uses of a coupon, overall or by one user: paid, or pending with a link that can still be paid.
create function public.coupon_uses(p_coupon uuid, p_user uuid default null)
returns integer language sql stable set search_path = '' as $$
  select count(*)::integer from public.payments
   where coupon_id = p_coupon and (p_user is null or user_id = p_user)
     and (status = 'paid' or (status = 'pending' and expires_at > now()));
$$;

-- What the checkout form needs to judge a code for one user. No row when the code doesn't exist. `pending_by_user`:
-- the user's own payable link already holds the use, so opening that checkout again is not a second use.
create function public.coupon_lookup(p_user uuid, p_code text)
returns table(id uuid, code text, percent integer, max_uses integer, active boolean, expires_at timestamptz,
  plan_ids text[], months integer[], used integer, paid_by_user boolean, pending_by_user boolean)
language sql stable set search_path = '' as $$
  select c.id, c.code, c.percent, c.max_uses, c.active, c.expires_at, c.plan_ids, c.months,
    public.coupon_uses(c.id),
    exists (select 1 from public.payments p where p.coupon_id = c.id and p.user_id = p_user and p.status = 'paid'),
    exists (select 1 from public.payments p where p.coupon_id = c.id and p.user_id = p_user and p.status = 'pending' and p.expires_at > now())
  from public.coupons c where c.code = upper(btrim(p_code));
$$;

-- Admin "Kupon": every coupon with its uses.
create function public.coupon_overview()
returns table(id uuid, used integer)
language sql stable set search_path = '' as $$
  select c.id, public.coupon_uses(c.id) from public.coupons c;
$$;

-- As before, plus the coupon: checked again under a row lock on the coupon, so two checkouts racing for the last use
-- (or one user's two tabs) can't both get it. A 100% coupon leaves nothing to pay, so its period starts right here,
-- in the same transaction: no Mayar link, and no pending row left behind if anything fails.
create or replace function public.prepare_billing_checkout(p_user uuid, p_snapshot jsonb, p_key text, p_expires timestamptz)
returns public.payments language plpgsql set search_path = '' as $$
declare v_row public.payments; v_term public.payments; v_line jsonb; v_kind text;
  v_coupon public.coupons; v_coupon_id uuid; v_total integer;
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
  v_total := (p_snapshot->>'total')::integer;
  if v_kind = 'upgrade' then
    if p_snapshot ? 'coupon' then raise exception 'coupon_invalid'; end if;
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
  if p_snapshot ? 'coupon' then
    v_coupon_id := (p_snapshot->'coupon'->>'id')::uuid;
    select * into v_coupon from public.coupons where id = v_coupon_id for update;
    if not found or not v_coupon.active or (v_coupon.expires_at is not null and v_coupon.expires_at <= now())
      or (cardinality(v_coupon.plan_ids) > 0 and not ((p_snapshot->'plan'->>'id') = any(v_coupon.plan_ids)))
      or (cardinality(v_coupon.months) > 0 and not ((p_snapshot->>'months')::integer = any(v_coupon.months))) then
      raise exception 'coupon_invalid';
    end if;
    if v_coupon.code is distinct from p_snapshot->'coupon'->>'code'
      or v_coupon.percent is distinct from (p_snapshot->'coupon'->>'percent')::integer then
      raise exception 'coupon_changed';
    end if;
    if public.coupon_uses(v_coupon_id, p_user) > 0 then raise exception 'coupon_used'; end if;
    if public.coupon_uses(v_coupon_id) >= v_coupon.max_uses then raise exception 'coupon_exhausted'; end if;
  end if;
  -- Only a 100% coupon may leave nothing to pay; anything else free would be a pricing bug.
  if v_total is null or v_total < 0 or (v_total = 0 and coalesce(v_coupon.percent, 0) <> 100) then
    raise exception 'invalid_total';
  end if;
  update public.payments set checkout_key = null where user_id = p_user and status = 'pending' and expires_at <= now();
  insert into public.payments(user_id, amount, snapshot, checkout_key, expires_at, kind, coupon_id)
    values (p_user, v_total, p_snapshot, p_key, p_expires, v_kind, v_coupon_id) returning * into v_row;
  if v_total = 0 then
    if not public.activate_payment(v_row.id, coalesce((p_snapshot->'plan'->>'days')::integer, 30)) then
      raise exception 'activation_failed';
    end if;
    select * into v_row from public.payments where id = v_row.id;
  end if;
  return v_row;
end $$;

revoke execute on function public.coupon_uses(uuid, uuid), public.coupon_lookup(uuid, text), public.coupon_overview(),
  public.prepare_billing_checkout(uuid, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.coupon_uses(uuid, uuid), public.coupon_lookup(uuid, text), public.coupon_overview(),
  public.prepare_billing_checkout(uuid, jsonb, text, timestamptz) to service_role;
