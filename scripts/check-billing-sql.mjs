// Isolated PostgreSQL checks; pass an installed PGlite module path as the first argument.
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
// The billing migration needs only these existing admin tables, not unrelated admin reporting functions.
await db.exec(`
  create table public.app_settings(plan_name text, plan_price_idr integer, plan_days integer, plan_credits integer);
  create table public.admin_log(id uuid default gen_random_uuid(), admin_id uuid, action text, detail jsonb);
  create table public.credit_adjustments(user_id uuid, amount integer, created_at timestamptz default now());
  create table public.sigap_daily_usage(user_id uuid, day date, task text, used integer check(used > 0), primary key(user_id,day,task));
  create function public.reserve_sigap_daily_usage(p_user_id uuid, p_task text, p_limit integer) returns boolean language sql as $$ select true $$;
`)
await db.exec(await readFile('supabase/migrations/20261023072311_billing_catalog.sql', 'utf8'))
const user = '00000000-0000-4000-8000-000000000001'
await db.query('insert into auth.users(id) values($1)', [user])
const snapshot = { version: 1, months: 3, plan: { days: 30, credits: 2500 } }
const payment = (await db.query(`insert into payments(user_id,amount,status,snapshot) values($1,396150,'pending',$2) returning id`, [user, snapshot])).rows[0].id
assert.equal((await db.query('select activate_payment($1,30) as ok', [payment])).rows[0].ok, true)
const period = (await db.query('select period_start,period_end from payments where id=$1', [payment])).rows[0]
assert.equal((await db.query('select activate_payment($1,30) as ok', [payment])).rows[0].ok, false)
assert.deepEqual((await db.query('select period_start,period_end from payments where id=$1', [payment])).rows[0], period)
assert.equal((await db.query(`select period_end = ((period_start at time zone 'UTC') + interval '3 months') at time zone 'UTC' as ok from payments where id=$1`, [payment])).rows[0].ok, true)
const reserve = () => db.query('select reserve_ai_credits($1,$2,$3,2500,2000) as id', [user, period.period_start, period.period_end])
const results = await Promise.all([reserve(), reserve()])
assert.equal(results.filter((result) => result.rows[0].id).length, 1, 'Concurrent requests cannot overspend')
const reservation = results.find((result) => result.rows[0].id).rows[0].id
await db.query('select settle_ai_credits($1,$2,false)', [reservation, user])
assert.equal((await db.query('select credits_used($1,$2) as n', [user, period.period_start])).rows[0].n, 0)
const next = (await reserve()).rows[0].id
await db.query('select settle_ai_credits($1,$2,true)', [next, user])
await db.query('insert into ai_generations(user_id,credits,reservation_id) values($1,2000,$2)', [user, next])
assert.equal((await db.query('select credits_used($1,$2) as n', [user, period.period_start])).rows[0].n, 2000, 'Log must not double charge reservation')
const late = (await db.query(`insert into payments(user_id,amount,status,snapshot) values($1,139000,'expired',$2) returning id`, [user, { ...snapshot, months: 1 }])).rows[0].id
assert.equal((await db.query('select activate_payment($1,30) as ok', [late])).rows[0].ok, true)
assert.equal((await db.query('select period_start = $2::timestamptz as ok from payments where id=$1', [late, period.period_end])).rows[0].ok, true)
const catalog = (await db.query('select config from billing_catalog')).rows[0].config
assert.equal((await db.query('select save_billing_catalog($1,1,$2) as ok', [user, catalog])).rows[0].ok, true)
assert.equal((await db.query('select save_billing_catalog($1,1,$2) as ok', [user, catalog])).rows[0].ok, false)
assert.equal((await db.query('select count(*)::int as n from admin_log')).rows[0].n, 1)
assert.equal((await db.query('select credits_total from billing_admin_overview($1)', [user])).rows[0].credits_total, 2500)
assert.equal((await db.query(`select has_function_privilege('anon','reserve_ai_credits(uuid,timestamptz,timestamptz,integer,integer)','execute') as ok`)).rows[0].ok, false)
const legacyUser = '00000000-0000-4000-8000-000000000002'
const expiredUser = '00000000-0000-4000-8000-000000000003'
await db.query('insert into auth.users(id) values($1),($2)', [legacyUser, expiredUser])
const legacySnapshot = { legacy: true, plan: { name: 'Old plan', credits: 10000, days: 30, researchDaily: 10 } }
const legacyPayment = (await db.query(`insert into payments(user_id,amount,status,period_start,period_end,snapshot)
  values($1,0,'paid',now() - interval '3 months 2 days','2099-12-31',$2) returning *`, [legacyUser, legacySnapshot])).rows[0]
const expiredPayment = (await db.query(`insert into payments(user_id,amount,status,period_start,period_end,snapshot)
  values($1,99000,'paid',now() - interval '2 months',now() - interval '1 month',$2) returning id`, [expiredUser, legacySnapshot])).rows[0].id
const legacyMigration = await readFile('supabase/migrations/20261023080756_legacy_access_pro.sql', 'utf8')
await db.exec(legacyMigration)
const converted = (await db.query('select * from payments where id=$1', [legacyPayment.id])).rows[0]
assert.equal(converted.snapshot.plan.id, 'pro')
assert.equal(converted.snapshot.plan.credits, 2500)
assert.equal(converted.snapshot.plan.researchDaily, 5)
assert.equal(converted.snapshot.monthly, true)
assert.deepEqual([converted.amount, converted.period_start, converted.period_end], [legacyPayment.amount, legacyPayment.period_start, legacyPayment.period_end])
assert.deepEqual((await db.query('select snapshot from payments where id=$1', [expiredPayment])).rows[0].snapshot, legacySnapshot)
assert.deepEqual((await db.query('select snapshot from payments where id=$1', [payment])).rows[0].snapshot, snapshot)
const legacyOverview = (await db.query('select * from billing_admin_overview($1)', [legacyUser])).rows[0]
assert.equal(legacyOverview.plan_name, 'Pro')
assert.equal(legacyOverview.credits_total, 2500)
assert.ok(new Date(legacyOverview.period_end) - new Date(legacyOverview.period_start) <= 31 * 86400000)
await db.exec(legacyMigration)
assert.deepEqual((await db.query('select snapshot from payments where id=$1', [legacyPayment.id])).rows[0].snapshot, converted.snapshot, 'Legacy migration is safe to rerun')
await db.close()
console.log('Billing SQL: activation, calendar term, duplicate webhook, late payment, credit reservation/refund, audit, privileges and legacy Pro migration passed.')
