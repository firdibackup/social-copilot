// Run against isolated PostgreSQL (PGlite), never a customer's database.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users(id uuid primary key, created_at timestamptz default now());
  create table public.ai_generations(id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz default now());
`)
await db.exec(await readFile('supabase/migrations/20261016050000_langganan.sql', 'utf8'))
await db.exec(`
  create table public.app_settings(plan_name text, plan_price_idr integer, plan_days integer, plan_credits integer);
  create table public.admin_log(id uuid default gen_random_uuid(), admin_id uuid, action text, detail jsonb);
  create table public.credit_adjustments(user_id uuid, amount integer, created_at timestamptz default now());
  create table public.sigap_daily_usage(user_id uuid, day date, task text, used integer, primary key(user_id,day,task));
  create function public.reserve_sigap_daily_usage(p_user_id uuid, p_task text, p_limit integer) returns boolean language sql as $$ select true $$;
`)
for (const migration of ['20261023072311_billing_catalog.sql', '20261023080756_legacy_access_pro.sql', '20261023083220_settings_billing_upgrade.sql']) {
  await db.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'))
}
const user = '00000000-0000-4000-8000-000000000001'
await db.query('insert into auth.users(id) values($1)', [user])
const catalog = (await db.query('select config from billing_catalog')).rows[0].config
const [pro, max] = catalog.plans
const purchased = { version: 1, months: 3, discount: 5, total: 396150, plan: pro }
const original = (await db.query(`insert into payments(user_id,amount,status,period_start,period_end,snapshot)
  values($1,396150,'paid',now() - interval '15 days',now() + interval '75 days',$2) returning *`, [user, purchased])).rows[0]
await db.query('insert into ai_generations(user_id, credits) values($1, 900)', [user])
const quote = { kind: 'upgrade', version: 1, plan: max, total: 498750, terms: [{ id: original.id, start: original.period_start, end: original.period_end, from: pro }] }
const prepare = (snapshot, key) => db.query(`select * from prepare_billing_checkout($1,$2,$3,now() + interval '1 hour')`, [user, snapshot, key])
const rows = await Promise.all([prepare(quote, 'upgrade'), prepare(quote, 'upgrade')])
const id = rows[0].rows[0].id
assert.equal(id, rows[1].rows[0].id, 'Double click reuses one reserved payment')
await assert.rejects(prepare(purchased, 'renew'), /checkout_pending/)
const claim = () => db.query(`update payments set last_checked_at=now() where id=$1 and last_checked_at is null returning id`, [id])
const claims = await Promise.all([claim(), claim()])
assert.equal(claims.filter((result) => result.rows.length).length, 1, 'Only one request creates a Mayar link')
assert.equal((await db.query('select activate_payment($1,30) as ok', [id])).rows[0].ok, true)
assert.equal((await db.query('select activate_payment($1,30) as ok', [id])).rows[0].ok, false)
const upgraded = (await db.query('select * from payments where id=$1', [original.id])).rows[0]
assert.deepEqual(upgraded.snapshot, purchased, 'Invoice snapshot remains immutable')
assert.deepEqual(upgraded.entitlement_plan, max)
assert.deepEqual([upgraded.period_start, upgraded.period_end], [original.period_start, original.period_end], 'No usage reset or extra subscription days')
assert.equal((await db.query('select credits_used($1,$2) as used', [user, original.period_start])).rows[0].used, 900)
assert.equal((await db.query('select credits_total from billing_admin_overview($1)', [user])).rows[0].credits_total, 12500)
const invoice = (await db.query('select * from payments where id=$1', [id])).rows[0]
assert.equal(invoice.period_start, null)
assert.equal(invoice.period_end, null)
await assert.rejects(prepare(quote, 'stale-upgrade'), /subscription_changed/)
const renewal = (await prepare({ ...purchased, plan: max }, 'renew')).rows[0]
await db.query('select activate_payment($1,30)', [renewal.id])
assert.deepEqual((await db.query('select period_start from payments where id=$1', [renewal.id])).rows[0].period_start, original.period_end)

// Late, paid invoices with a changed entitlement are recorded for resolution, never silently applied twice.
const conflicting = (await db.query(`insert into payments(user_id,amount,status,snapshot,kind)
  values($1,498750,'expired',$2,'upgrade') returning id`, [user, quote])).rows[0].id
assert.equal((await db.query('select activate_payment($1,30) as ok', [conflicting])).rows[0].ok, false)
assert.deepEqual((await db.query('select status, fulfillment_error from payments where id=$1', [conflicting])).rows[0], { status: 'paid', fulfillment_error: 'subscription_changed' })
assert.equal((await db.query(`select has_function_privilege('anon','prepare_billing_checkout(uuid,jsonb,text,timestamptz)','execute') as ok`)).rows[0].ok, false)
assert.equal((await db.query(`select has_function_privilege('authenticated','activate_payment(uuid,integer)','execute') as ok`)).rows[0].ok, false)
await db.close()
console.log('Upgrade SQL passed: migration, checkout locking, immediate entitlement, immutable invoice/cycle, usage preservation, duplicate webhook, renewal, stale quote, late conflict and privileges.')
