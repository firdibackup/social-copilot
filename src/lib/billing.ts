import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { getPlan } from './app-settings'
import { getBillingCatalog } from './billing-catalog'
import { billingCycle, quotePurchase, type CatalogPlan, type PurchaseSnapshot } from './billing-catalog-options'
import { normalizeCouponCode, withCoupon } from './coupon-options'
import { findCoupon } from './coupons'
import { usedPercent } from './billing-options'
import { describeError } from './errors'
import { appUrl, env } from './env'
import { quoteUpgrade, type PaidTerm, type UpgradeSnapshot } from './billing-upgrade-options'
import { createPaymentRequest, getPaymentRequest } from './mayar'
import { db, unwrap } from './supabase'
import { mayarMobile, type CustomerContact } from './whatsapp'

const HOUR_MS = 60 * 60 * 1000
/** How long a Mayar link stays payable. */
const LINK_TTL_MS = 24 * HOUR_MS
/** A pending link closer than this to expiry is not handed out again. */
const REUSE_MARGIN_MS = HOUR_MS / 6
const HISTORY_LIMIT = 12

export interface Period {
  plan?: CatalogPlan
  start: Date
  end: Date
  /** End of the last paid period, later than `end` when the user paid ahead. */
  activeUntil: Date
}

export type PaymentStatus = 'pending' | 'paid' | 'expired'

export interface Payment {
  id: string
  amount: number
  status: PaymentStatus
  createdAt: Date
  periodStart: Date | null
  periodEnd: Date | null
  kind: 'subscription' | 'upgrade'
  link: string | null
  fulfillmentError: string | null
  planName: string | null
  couponCode: string | null
}

interface PaymentRow {
  snapshot?: (PurchaseSnapshot | UpgradeSnapshot | { legacy: true; plan: CatalogPlan }) & { monthly?: boolean } | null
  id: string
  mayar_id: string | null
  link: string | null
  amount: number
  status: PaymentStatus
  expires_at: string | null
}

const toDate = (value: string | null) => (value ? new Date(value) : null)

/** The paid period that covers now, or null when the user has no active subscription. */
export async function getCurrentPeriod(userId: string, now = new Date()): Promise<Period | null> {
  const rows = unwrap(
    await db()
      .from('payments')
      .select('period_start, period_end, snapshot, entitlement_plan')
      .eq('user_id', userId)
      .eq('status', 'paid')
      .gt('period_end', now.toISOString())
      .order('period_start', { ascending: true }),
  ) as { period_start: string; period_end: string; snapshot?: PaymentRow['snapshot']; entitlement_plan?: CatalogPlan | null }[]
  const current = rows.find((row) => new Date(row.period_start) <= now)
  if (!current) return null
  const start = new Date(current.period_start)
  const end = new Date(current.period_end)
  return {
    ...(current.snapshot && ('months' in current.snapshot || current.snapshot.monthly === true) ? billingCycle(start, end, now) : { start, end }),
    plan: current.entitlement_plan ?? current.snapshot?.plan,
    activeUntil: new Date(Math.max(...rows.map((row) => new Date(row.period_end).getTime()))),
  }
}

/** Credits spent since `since`. Throws when the count can't be read, so AI requests stop rather than run free. */
export async function creditsUsed(userId: string, since: Date): Promise<number> {
  const used: unknown = unwrap(await db().rpc('credits_used', { p_user_id: userId, p_since: since.toISOString() }))
  if (typeof used !== 'number') throw new Error('Supabase: jumlah kredit tidak terbaca; sudah menjalankan migrasi langganan?')
  return used
}

export interface Usage {
  used: number
  /** The plan's credits per period. */
  credits: number
  percent: number
}

export async function getUsage(userId: string, period: Period): Promise<Usage> {
  const [used, plan] = await Promise.all([creditsUsed(userId, period.start), period.plan ?? getPlan()])
  return { used, credits: plan.credits, percent: usedPercent(used, plan.credits) }
}

export async function listPayments(userId: string): Promise<Payment[]> {
  const rows = unwrap(
    await db()
      .from('payments')
      .select('id, amount, status, created_at, period_start, period_end, kind, link, fulfillment_error, snapshot, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
  ) as { id: string; amount: number; status: PaymentStatus; created_at: string; period_start: string | null; period_end: string | null;
    kind: Payment['kind']; link: string | null; fulfillment_error: string | null; snapshot: PaymentRow['snapshot']; expires_at: string | null }[]
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    status: row.status === 'pending' && row.expires_at && new Date(row.expires_at) <= new Date() ? 'expired' : row.status,
    createdAt: new Date(row.created_at),
    periodStart: toDate(row.period_start),
    periodEnd: toDate(row.period_end),
    kind: row.kind,
    link: row.link,
    fulfillmentError: row.fulfillment_error,
    planName: row.snapshot?.plan.name ?? null,
    couponCode: row.snapshot && 'coupon' in row.snapshot ? row.snapshot.coupon?.code ?? null : null,
  }))
}

/** Checkout is enabled explicitly; disabling payments does not grant free access. */
export const paymentsEnabled = () => process.env.MAYAR_ENABLED?.trim() === 'true'

/** A free period of the plan's length, or `days` (from an admin), stacked after any the user already has. */
export async function grantFreePeriod(userId: string, days?: number): Promise<void> {
  const plan = await getPlan()
  const length = days ?? plan.days
  const { id } = unwrap(
    await db().from('payments').insert({ user_id: userId, amount: 0, status: 'pending', snapshot: {
      legacy: true, plan: { ...plan, days: length, chatDaily: 100, researchDaily: 10, prioritySupport: false, earlyAccess: false },
    } }).select('id').single(),
  ) as { id: string }
  unwrap(await db().rpc('activate_payment', { p_id: id, p_days: length }))
}

export interface CheckoutChoice {
  planId: string
  months: number
  version: number
  /** Empty or missing: no coupon. */
  couponCode?: string
}

/**
 * The purchase for this choice, with the coupon taken off when one is given. Throws a CouponError the user can read
 * when the coupon can't be used; the database checks it again, under a lock, when the payment is reserved.
 */
export async function quoteCheckout(userId: string, choice: CheckoutChoice, now = new Date()): Promise<PurchaseSnapshot> {
  const { catalog, version } = await getBillingCatalog()
  if (choice.version && choice.version !== version) throw new Error('Harga diperbarui. Muat ulang ringkasan pembayaran.')
  const purchase = quotePurchase(catalog, version, choice.planId, choice.months)
  const code = normalizeCouponCode(choice.couponCode)
  if (!code) return purchase
  const { coupon, usage } = await findCoupon(userId, code)
  return withCoupon(purchase, coupon, usage, now)
}

/**
 * A pending link is reused only for the same catalog version, plan, duration, and coupon.
 * A unique checkout key prevents simultaneous requests from creating multiple payable links.
 * A 100% coupon leaves nothing to pay: the database starts the period at once and no Mayar link is made, so it works
 * even while payments are off. Returns where to send the user.
 */
export async function startCheckout(userId: string, email: string, contact: CustomerContact, now = new Date(), choice: CheckoutChoice = { planId: 'pro', months: 1, version: 0 }): Promise<string> {
  const snapshot = await quoteCheckout(userId, choice, now)
  if (snapshot.total > 0 && !paymentsEnabled()) throw new Error('Pembayaran belum diaktifkan.')
  const key = `${userId}:${snapshot.version}:${snapshot.plan.id}:${snapshot.months}:${snapshot.coupon?.code ?? ''}`
  return createCheckout(userId, email, contact, snapshot, key, now)
}

export async function getUpgradeQuote(userId: string, planId: string, now = new Date()) {
  const { catalog, version } = await getBillingCatalog()
  const target = catalog.plans.find((plan) => plan.id === planId && plan.active)
  if (!target) throw new Error('Paket tidak tersedia.')
  const terms = unwrap(await db().from('payments').select('id, period_start, period_end, snapshot, entitlement_plan')
    .eq('user_id', userId).eq('status', 'paid').gt('period_end', now.toISOString()).order('period_start')) as PaidTerm[]
  const quote = quoteUpgrade(terms, target, version, now)
  const payload = Buffer.from(JSON.stringify({ userId, quote })).toString('base64url')
  return { quote, token: `${payload}.${signQuote(payload)}` }
}

function signQuote(payload: string) {
  return createHmac('sha256', env('SUPABASE_SERVICE_ROLE_KEY')).update(payload).digest('base64url')
}

export async function startUpgradeCheckout(userId: string, email: string, contact: CustomerContact, token: string, now = new Date()) {
  if (token.length > 100_000) throw new Error('Ringkasan upgrade tidak valid.')
  const [payload, signature = ''] = token.split('.')
  const expected = signQuote(payload)
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('Ringkasan upgrade tidak valid. Hitung ulang biaya.')
  }
  const signed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { userId: string; quote: UpgradeSnapshot }
  if (signed.userId !== userId || now.getTime() - new Date(signed.quote.quotedAt).getTime() > REUSE_MARGIN_MS) {
    throw new Error('Ringkasan upgrade kedaluwarsa. Hitung ulang biaya.')
  }
  return createCheckout(userId, email, contact, signed.quote, `${userId}:upgrade:${createHash('sha256').update(payload).digest('hex')}`, now)
}

async function createCheckout(userId: string, email: string, contact: CustomerContact, snapshot: PurchaseSnapshot | UpgradeSnapshot, key: string, now: Date) {
  const plan = snapshot.plan
  const upgrade = 'kind' in snapshot
  const expiresAt = new Date(Math.min(now.getTime() + (upgrade ? HOUR_MS : LINK_TTL_MS),
    upgrade ? new Date(snapshot.activeUntil).getTime() : Infinity))
  if (expiresAt.getTime() - now.getTime() < 60_000) throw new Error('Masa aktif hampir berakhir. Aktifkan paket kembali setelah periode ini.')
  const row = unwrap(await db().rpc('prepare_billing_checkout', {
    p_user: userId, p_snapshot: snapshot, p_key: key, p_expires: expiresAt.toISOString(),
  })) as { id: string; link: string | null; status: PaymentStatus }
  // Kept on the row even when its link is reused: the team follows up with the latest contact.
  unwrap(await db().from('payments').update({ customer_name: contact.name, customer_whatsapp: contact.whatsapp }).eq('id', row.id))
  // Free through a 100% coupon: already active, nothing to pay at Mayar.
  if (row.status === 'paid') return appUrl('/langganan', { bayar: 'selesai', pesanan: row.id })
  if (row.link) return row.link
  const { id } = row
  const claimed = unwrap(await db().from('payments').update({ last_checked_at: now.toISOString() })
    .eq('id', id).is('last_checked_at', null).select('id')) as { id: string }[]
  if (!claimed.length) throw new Error('Pembayaran sedang disiapkan. Tunggu sebentar lalu cek status.')

  try {
    const created = await createPaymentRequest({
      name: contact.name,
      amount: snapshot.total,
      email,
      mobile: mayarMobile(contact.whatsapp),
      description: upgrade ? `Upgrade Carousely ${plan.name} · pesanan ${id}`
        : `Carousely ${plan.name} ${snapshot.months} bulan${snapshot.coupon ? ` · kupon ${snapshot.coupon.code}` : ''} · pesanan ${id}`,
      redirectUrl: appUrl('/langganan', { bayar: 'selesai', pesanan: id }),
      expiredAt: expiresAt,
    })
    unwrap(await db().from('payments').update({ mayar_id: created.id, link: created.link,
      ...(created.transactionId ? { mayar_transaction_id: created.transactionId } : {}),
    }).eq('id', id))
    return created.link
  } catch (error) {
    // No link reached the user, so nothing can be paid against this row.
    await db().from('payments').update({ status: 'expired', checkout_key: null }).eq('id', id)
    throw error
  }
}

/**
 * Asks Mayar whether the payment went through and, when it did for the full amount, starts its period. Only Mayar's
 * answer to our own API key counts: a webhook body is never trusted. Returns true when this call activated it.
 */
export async function confirmPayment(row: PaymentRow, now = new Date()): Promise<boolean> {
  if (row.status === 'paid' || !row.mayar_id) return false
  const state = await getPaymentRequest(row.mayar_id)
  if (state.status === 'paid' && state.amount === row.amount) {
    const { days } = row.snapshot?.plan ?? await getPlan()
    const activated: unknown = unwrap(await db().rpc('activate_payment', { p_id: row.id, p_days: days }))
    return activated === true
  }
  if (row.expires_at && new Date(row.expires_at) <= now) {
    unwrap(await db().from('payments').update({ status: 'expired' }).eq('id', row.id).eq('status', 'pending'))
  }
  return false
}

const PENDING_COLUMNS = 'id, mayar_id, link, amount, status, expires_at, snapshot'

async function confirmAll(rows: PaymentRow[]): Promise<number> {
  let activated = 0
  for (const row of rows) {
    if (await confirmPayment(row)) activated += 1
  }
  return activated
}

/** Checks every pending payment of the user, e.g. when they come back from Mayar's checkout. */
export async function syncPendingPayments(userId: string): Promise<number> {
  const rows = unwrap(
    await db().from('payments').select(PENDING_COLUMNS).eq('user_id', userId).in('status', ['pending', 'expired'])
      .not('mayar_id', 'is', null).order('created_at', { ascending: false }).limit(20),
  ) as PaymentRow[]
  return confirmAll(rows)
}

/** The pending payments a Mayar webhook may be about. Ids that match none are ignored. */
export async function syncPaymentsByMayarIds(mayarIds: string[]): Promise<number> {
  if (mayarIds.length === 0) return 0
  const rows = unwrap(
    await db().from('payments').select(PENDING_COLUMNS).in('mayar_id', mayarIds).in('status', ['pending', 'expired']),
  ) as PaymentRow[]
  const transactions = unwrap(await db().from('payments').select(PENDING_COLUMNS)
    .in('mayar_transaction_id', mayarIds).in('status', ['pending', 'expired'])) as PaymentRow[]
  return confirmAll([...new Map([...rows, ...transactions].map((row) => [row.id, row])).values()])
}

/** A bounded background sweep recovers payments even if the customer closes the tab. */
export async function reconcilePayments(): Promise<number> {
  if (!paymentsEnabled()) return 0
  const rows = unwrap(await db().from('payments').select(PENDING_COLUMNS)
    .in('status', ['pending', 'expired']).not('mayar_id', 'is', null)
    .gt('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .order('last_checked_at', { ascending: true, nullsFirst: true }).limit(20)) as PaymentRow[]
  let activated = 0
  for (const row of rows) {
    try { if (await confirmPayment(row)) activated++ }
    catch (error) { console.error('[mayar] pemeriksaan berkala gagal:', describeError(error)) }
    await db().from('payments').update({ last_checked_at: new Date().toISOString() }).eq('id', row.id)
  }
  return activated
}

/**
 * What the checkout form starts with: the contact of the user's last checkout, or else the name they signed up with
 * (Google gives one), their Instagram username, or the part of the email before the @.
 */
export async function getCheckoutContact(userId: string, email: string): Promise<{ name: string; whatsapp: string }> {
  const [last] = unwrap(await db().from('payments').select('customer_name, customer_whatsapp').eq('user_id', userId)
    .not('customer_whatsapp', 'is', null).order('created_at', { ascending: false }).limit(1)) as
    { customer_name: string | null; customer_whatsapp: string | null }[]
  if (last?.customer_name && last.customer_whatsapp) return { name: last.customer_name, whatsapp: mayarMobile(last.customer_whatsapp) }
  const { data } = await db().auth.admin.getUserById(userId)
  const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>
  const signedUpAs = [meta.full_name, meta.name].find((value): value is string => typeof value === 'string' && value.trim() !== '')
  let name = signedUpAs?.trim()
  if (!name) {
    const instagram = unwrap(await db().from('instagram_connections').select('username').eq('user_id', userId).limit(1)) as { username: string }[]
    name = instagram[0]?.username ?? email.split('@')[0] ?? ''
  }
  const phone = typeof data.user?.phone === 'string' && data.user.phone ? mayarMobile(data.user.phone.replace(/\D/g, '')) : ''
  return { name: name.slice(0, 100), whatsapp: phone }
}
