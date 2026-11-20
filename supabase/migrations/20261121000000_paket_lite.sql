-- Meta rejected the DM permission (Nov 2026): Lite is sold without DMs, Pro and Max take a waitlist until it is approved.

create table public.plan_waitlist (
  user_id    uuid not null references auth.users (id) on delete cascade,
  plan_id    text not null check (plan_id ~ '^[a-z][a-z0-9-]{0,39}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, plan_id)
);
-- Accessed only by the server with the service role, like payments.
alter table public.plan_waitlist enable row level security;
revoke all on public.plan_waitlist from anon, authenticated;
grant all on public.plan_waitlist to service_role;

-- Lite on sale; Pro and Max on the waitlist. Chat limits rise with the tier (Max had 10, below Pro's 30).
update public.billing_catalog
set version = version + 1, updated_at = now(),
    config = jsonb_set(config, '{plans}', jsonb_build_array(
      jsonb_build_object('id', 'lite', 'name', 'Lite', 'days', 30, 'active', true, 'credits', 2000, 'priceIdr', 59000,
        'chatDaily', 20, 'researchDaily', 3, 'description', 'Untuk mulai rutin membuat dan menjadwalkan konten dengan AI.',
        'earlyAccess', false, 'prioritySupport', false)
    ) || (
      select jsonb_agg(plan || jsonb_build_object('active', false, 'waitlist', true,
        'chatDaily', case plan->>'id' when 'max' then 100 else 30 end) order by ord)
      from jsonb_array_elements(config->'plans') with ordinality as p(plan, ord)
      where plan->>'id' in ('pro', 'max')
    ))
where id;
