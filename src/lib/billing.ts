import 'server-only'
import { PLAN, usedPercent } from './billing-options'
import { appUrl } from './env'
import { createPaymentRequest, getPaymentRequest } from './mayar'
import { db, unwrap } from './supabase'

const HOUR_MS = 60 * 60 * 1000
/** How long a Mayar link stays payable. */
const LINK_TTL_MS = 24 * HOUR_MS
/** A pending link closer than this to expiry is not handed out again. */
const REUSE_MARGIN_MS = HOUR_MS / 6
const HISTORY_LIMIT = 12

export interface Period {
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
}

interface PaymentRow {
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
      .select('period_start, period_end')
      .eq('user_id', userId)
      .eq('status', 'paid')
      .gt('period_end', now.toISOString())
      .order('period_start', { ascending: true }),
  ) as { period_start: string; period_end: string }[]
  const current = rows.find((row) => new Date(row.period_start) <= now)
  if (!current) return null
  return {
    start: new Date(current.period_start),
    end: new Date(current.period_end),
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
  percent: number
}

export async function getUsage(userId: string, period: Period): Promise<Usage> {
  const used = await creditsUsed(userId, period.start)
  return { used, percent: usedPercent(used) }
}

export async function listPayments(userId: string): Promise<Payment[]> {
  const rows = unwrap(
    await db()
      .from('payments')
      .select('id, amount, status, created_at, period_start, period_end')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
  ) as { id: string; amount: number; status: PaymentStatus; created_at: string; period_start: string | null; period_end: string | null }[]
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    status: row.status,
    createdAt: new Date(row.created_at),
    periodStart: toDate(row.period_start),
    periodEnd: toDate(row.period_end),
  }))
}

/**
 * Payments go through Mayar only once MAYAR_ENABLED=true. Until then (testing) every period is free: users get one
 * when they sign up and another from /langganan whenever they ask.
 */
export const paymentsEnabled = () => process.env.MAYAR_ENABLED?.trim() === 'true'

/** One free period, stacked after any the user already has like a paid one. */
export async function grantFreePeriod(userId: string): Promise<void> {
  const { id } = unwrap(
    await db().from('payments').insert({ user_id: userId, amount: 0, status: 'pending' }).select('id').single(),
  ) as { id: string }
  unwrap(await db().rpc('activate_payment', { p_id: id, p_days: PLAN.days }))
}

/**
 * The checkout link for one more period. A pending link that is still payable is handed out again, so a user who
 * clicks twice pays once. The row is written before Mayar is asked, so every link a user can open has a row.
 */
export async function startCheckout(userId: string, email: string, now = new Date()): Promise<string> {
  const reusable = unwrap(
    await db()
      .from('payments')
      .select('link')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .not('link', 'is', null)
      .gt('expires_at', new Date(now.getTime() + REUSE_MARGIN_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(1),
  ) as { link: string }[]
  if (reusable[0]) return reusable[0].link

  const expiresAt = new Date(now.getTime() + LINK_TTL_MS)
  const { id } = unwrap(
    await db()
      .from('payments')
      .insert({ user_id: userId, amount: PLAN.priceIdr, status: 'pending', expires_at: expiresAt.toISOString() })
      .select('id')
      .single(),
  ) as { id: string }

  try {
    const created = await createPaymentRequest({
      name: PLAN.name,
      amount: PLAN.priceIdr,
      email,
      description: `Langganan Social Copilot ${PLAN.days} hari`,
      redirectUrl: appUrl('/langganan', { bayar: 'selesai' }),
      expiredAt: expiresAt,
    })
    unwrap(await db().from('payments').update({ mayar_id: created.id, link: created.link }).eq('id', id))
    return created.link
  } catch (error) {
    // No link reached the user, so nothing can be paid against this row.
    await db().from('payments').update({ status: 'expired' }).eq('id', id)
    throw error
  }
}

/**
 * Asks Mayar whether the payment went through and, when it did for the full amount, starts its period. Only Mayar's
 * answer to our own API key counts: a webhook body is never trusted. Returns true when this call activated it.
 */
export async function confirmPayment(row: PaymentRow, now = new Date()): Promise<boolean> {
  if (row.status !== 'pending' || !row.mayar_id) return false
  const state = await getPaymentRequest(row.mayar_id)
  if (state.status === 'paid' && state.amount === row.amount) {
    const activated: unknown = unwrap(await db().rpc('activate_payment', { p_id: row.id, p_days: PLAN.days }))
    return activated === true
  }
  if (row.expires_at && new Date(row.expires_at) <= now) {
    unwrap(await db().from('payments').update({ status: 'expired' }).eq('id', row.id).eq('status', 'pending'))
  }
  return false
}

const PENDING_COLUMNS = 'id, mayar_id, link, amount, status, expires_at'

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
    await db().from('payments').select(PENDING_COLUMNS).eq('user_id', userId).eq('status', 'pending'),
  ) as PaymentRow[]
  return confirmAll(rows)
}

/** The pending payments a Mayar webhook may be about. Ids that match none are ignored. */
export async function syncPaymentsByMayarIds(mayarIds: string[]): Promise<number> {
  if (mayarIds.length === 0) return 0
  const rows = unwrap(
    await db().from('payments').select(PENDING_COLUMNS).in('mayar_id', mayarIds).eq('status', 'pending'),
  ) as PaymentRow[]
  return confirmAll(rows)
}
