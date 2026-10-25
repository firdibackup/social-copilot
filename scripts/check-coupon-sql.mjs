// Run against isolated PostgreSQL (PGlite), never a customer's database.
// node scripts/check-coupon-sql.mjs <pglite-module>/dist/index.js
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
for (const migration of ['20261023072311_billing_catalog.sql', '20261023080756_legacy_access_pro.sql', '20261023083220_settings_billing_upgrade.sql', '20261025070000_kupon.sql']) {
  await db.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'))
}
const users = ['01', '02', '03', '04'].map((n) => `00000000-0000-4000-8000-0000000000${n}`)
for (const user of users) await db.query('insert into auth.users(id) values($1)', [user])
const [a, b, c, d] = users
const { plans: [pro, max] } = (await db.query('select config from billing_catalog')).rows[0].config
const coupon = async (code, percent, maxUses, extra = {}) => (await db.query(
  `insert into coupons(code, percent, max_uses, plan_ids, months, expires_at, active) values($1,$2,$3,$4,$5,$6,$7) returning *`,
  [code, percent, maxUses, extra.planIds ?? [], extra.months ?? [], extra.expiresAt ?? null, extra.active ?? true])).rows[0]
const snap = (row, plan = pro, months = 1, total) => ({ version: 1, plan, months, discount: 0,
  total: total ?? Math.round(plan.priceIdr * months * (100 - row.percent) / 100), coupon: { id: row.id, code: row.code, percent: row.percent } })
const prepare = (user, snapshot, key) => db.query(`select * from prepare_billing_checkout($1,$2,$3,now() + interval '24 hours')`, [user, snapshot, key])
const uses = async (id, user = null) => (await db.query('select coupon_uses($1,$2) as n', [id, user])).rows[0].n

// 1. Quota: two users race for the last use of a one-use coupon; exactly one wins.
const one = await coupon('SATU', 20, 1)
const race = await Promise.allSettled([prepare(a, snap(one), 'a1'), prepare(b, snap(one), 'b1')])
assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1, 'Only one checkout takes the last use')
assert.match(race.find((r) => r.status === 'rejected').reason.message, /coupon_exhausted/)
assert.equal(await uses(one.id), 1)
const winner = race[0].status === 'fulfilled' ? a : b
const loser = winner === a ? b : a
const held = (await db.query('select * from payments where user_id=$1', [winner])).rows[0]
assert.equal(held.coupon_id, one.id)
assert.equal(held.amount, 111200)
assert.equal(held.status, 'pending')

// 2. Same checkout again (double click / back button) reuses the row, no second use.
assert.equal((await prepare(winner, snap(one), winner === a ? 'a1' : 'b1')).rows[0].id, held.id)
assert.equal(await uses(one.id), 1)

// 3. The link expires unpaid: the use comes back and the other user can take it.
await db.query(`update payments set expires_at = now() - interval '1 minute' where id=$1`, [held.id])
assert.equal(await uses(one.id), 0, 'An expired link gives the use back')
const second = (await prepare(loser, snap(one), 'l1')).rows[0]
assert.equal(second.coupon_id, one.id)

// 4. Once per user: paid use blocks the same user, even with quota left.
const many = await coupon('BANYAK', 10, 5)
const paid = (await prepare(c, snap(many), 'c1')).rows[0]
assert.equal((await db.query('select activate_payment($1,30) as ok', [paid.id])).rows[0].ok, true)
await assert.rejects(prepare(c, snap(many, pro, 1), 'c2'), /coupon_used/)
assert.equal(await uses(many.id, c), 1)

// 5. 100%: activated inside prepare, amount 0, period set, no pending row left.
const free = await coupon('GRATIS', 100, 2)
const freeRow = (await prepare(d, snap(free, max, 3, 0), 'd1')).rows[0]
assert.equal(freeRow.status, 'paid')
assert.equal(freeRow.amount, 0)
assert.ok(freeRow.period_end > freeRow.period_start)
const months = (await db.query(`select extract(month from age(period_end, period_start))::int as m from payments where id=$1`, [freeRow.id])).rows[0].m
assert.equal(months, 3, '100% coupon grants the chosen duration')
assert.equal((await db.query(`select count(*)::int as n from payments where user_id=$1 and status='pending'`, [d])).rows[0].n, 0)
assert.equal(await uses(free.id), 1)
// A second free period for the same user is refused; it stacks for nobody.
await assert.rejects(prepare(d, snap(free, max, 3, 0), 'd2'), /coupon_used/)

// 6. Only a 100% coupon may make a checkout free; a tampered total is refused.
await assert.rejects(prepare(a, { ...snap(many), total: 0 }, 'a-zero'), /invalid_total/)
await assert.rejects(prepare(a, { version: 1, plan: pro, months: 1, discount: 0, total: 0 }, 'a-zero2'), /invalid_total/)

// 7. Coupon changed or switched off between preview and pay.
const later = await coupon('NANTI', 30, 10)
await db.query('update coupons set percent = 40 where id=$1', [later.id])
await assert.rejects(prepare(a, snap(later), 'a-changed'), /coupon_changed/)
await db.query('update coupons set active = false where id=$1', [later.id])
await assert.rejects(prepare(a, snap({ ...later, percent: 40 }), 'a-off'), /coupon_invalid/)
const old = await coupon('LAMA', 10, 10, { expiresAt: new Date(Date.now() - 60000).toISOString() })
await assert.rejects(prepare(a, snap(old), 'a-old'), /coupon_invalid/)

// 8. Plan and duration restrictions.
const maxOnly = await coupon('MAXSAJA', 15, 10, { planIds: ['max'], months: [3, 6] })
await assert.rejects(prepare(a, snap(maxOnly, pro, 3), 'a-pro'), /coupon_invalid/)
await assert.rejects(prepare(a, snap(maxOnly, max, 1), 'a-1m'), /coupon_invalid/)
await db.query(`delete from payments where user_id=$1 and status='pending'`, [a])
const ok = (await prepare(a, snap(maxOnly, max, 6), 'a-max6')).rows[0]
assert.equal(ok.coupon_id, maxOnly.id)

// 9. A coupon on an upgrade is refused.
await assert.rejects(prepare(b, { kind: 'upgrade', version: 1, plan: max, total: 5000, terms: [], coupon: { id: many.id, code: 'BANYAK', percent: 10 } }, 'b-up'), /checkout_pending|coupon_invalid/)

// 10. A used coupon can't be deleted; lookup reports uses; privileges.
await assert.rejects(db.query('delete from coupons where id=$1', [many.id]), /foreign key/)
const looked = (await db.query(`select * from coupon_lookup($1,' banyak ')`, [c])).rows[0]
assert.deepEqual([looked.used, looked.paid_by_user, looked.pending_by_user], [1, true, false])
const heldByLoser = (await db.query(`select * from coupon_lookup($1,'SATU')`, [loser])).rows[0]
assert.deepEqual([heldByLoser.used, heldByLoser.pending_by_user], [1, true])
assert.equal((await db.query(`select has_function_privilege('authenticated','coupon_lookup(uuid,text)','execute') as ok`)).rows[0].ok, false)
assert.equal((await db.query(`select has_table_privilege('anon','public.coupons','select') as ok`)).rows[0].ok, false)
assert.equal((await db.query(`select has_function_privilege('anon','prepare_billing_checkout(uuid,jsonb,text,timestamptz)','execute') as ok`)).rows[0].ok, false)
await db.close()
console.log('Coupon SQL passed: quota race, reuse, expiry returns use, once per user, 100% activation, tampered total, changed/disabled/expired, restrictions, upgrade, delete guard, lookup and privileges.')
