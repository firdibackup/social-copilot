import 'server-only'
import { CouponError, normalizeCouponCode, type Coupon, type CouponInput, type CouponUsage } from './coupon-options'
import { db, unwrap } from './supabase'

interface CouponRow {
  id: string
  code: string
  percent: number
  max_uses: number
  active: boolean
  expires_at: string | null
  plan_ids: string[] | null
  months: number[] | null
}

const toCoupon = (row: CouponRow): Coupon => ({
  id: row.id,
  code: row.code,
  percent: row.percent,
  maxUses: row.max_uses,
  active: row.active,
  expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  planIds: row.plan_ids ?? [],
  months: row.months ?? [],
})

/** The coupon behind `code` and how often it was used, overall and by this user. Throws when there is none. */
export async function findCoupon(userId: string, code: string): Promise<{ coupon: Coupon; usage: CouponUsage }> {
  const normalized = normalizeCouponCode(code)
  if (!normalized || normalized.length > 30) throw new CouponError('Kode kupon tidak ditemukan.')
  const rows = unwrap(await db().rpc('coupon_lookup', { p_user: userId, p_code: normalized })) as
    (CouponRow & { used: number; paid_by_user: boolean; pending_by_user: boolean })[] | null
  const row = rows?.[0]
  if (!row) throw new CouponError('Kode kupon tidak ditemukan.')
  // The user's own open link holds a use already: going back to it is not a second one. The database then hands
  // that link out again, or refuses a different checkout while it is open.
  const held = row.pending_by_user && !row.paid_by_user
  return { coupon: toCoupon(row), usage: { used: held ? row.used - 1 : row.used, usedByUser: row.paid_by_user } }
}

export interface AdminCoupon extends Coupon {
  used: number
  createdAt: Date
}

export async function listCoupons(): Promise<AdminCoupon[]> {
  const [rows, uses] = await Promise.all([
    db().from('coupons').select('id, code, percent, max_uses, active, expires_at, plan_ids, months, created_at').order('created_at', { ascending: false }),
    db().rpc('coupon_overview'),
  ])
  const used = new Map((unwrap(uses) as { id: string; used: number }[] | null ?? []).map((row) => [row.id, row.used]))
  return (unwrap(rows) as (CouponRow & { created_at: string })[]).map((row) => ({
    ...toCoupon(row), used: used.get(row.id) ?? 0, createdAt: new Date(row.created_at),
  }))
}

const columns = (input: CouponInput) => ({
  code: input.code, percent: input.percent, max_uses: input.maxUses, active: input.active,
  expires_at: input.expiresAt?.toISOString() ?? null, plan_ids: input.planIds, months: input.months,
})

const duplicate = (error: unknown) => error instanceof Error && /duplicate key|coupons_code_key/.test(error.message)

export async function createCoupon(adminId: string, input: CouponInput): Promise<string> {
  try {
    const { id } = unwrap(await db().from('coupons').insert({ ...columns(input), created_by: adminId }).select('id').single()) as { id: string }
    return id
  } catch (error) {
    if (duplicate(error)) throw new CouponError(`Kode ${input.code} sudah dipakai kupon lain.`)
    throw error
  }
}

/**
 * Edits a coupon. A used coupon keeps its code and percent: payments already carry them, and a checkout in progress
 * would otherwise be refused at the last step. Its quota can't go below the uses it already has.
 */
export async function updateCoupon(id: string, input: CouponInput): Promise<void> {
  const before = unwrap(await db().from('coupons').select('code, percent').eq('id', id).maybeSingle()) as { code: string; percent: number } | null
  if (!before) throw new CouponError('Kupon tidak ditemukan.')
  const used = unwrap(await db().rpc('coupon_uses', { p_coupon: id })) as number
  if (used > 0 && (before.code !== input.code || before.percent !== input.percent)) {
    throw new CouponError('Kupon yang sudah dipakai tidak bisa diganti kode atau diskonnya. Nonaktifkan lalu buat kupon baru.')
  }
  if (input.maxUses < used) throw new CouponError(`Kuantitas tidak bisa di bawah pemakaian saat ini (${used}).`)
  try {
    unwrap(await db().from('coupons').update({ ...columns(input), updated_at: new Date().toISOString() }).eq('id', id))
  } catch (error) {
    if (duplicate(error)) throw new CouponError(`Kode ${input.code} sudah dipakai kupon lain.`)
    throw error
  }
}

export async function setCouponActive(id: string, active: boolean): Promise<void> {
  const rows = unwrap(await db().from('coupons').update({ active, updated_at: new Date().toISOString() }).eq('id', id).select('id')) as { id: string }[]
  if (!rows.length) throw new CouponError('Kupon tidak ditemukan.')
}

/** Only a coupon no payment ever carried can go; the foreign key refuses the rest too. */
export async function deleteCoupon(id: string): Promise<void> {
  const { count, error } = await db().from('payments').select('id', { count: 'exact', head: true }).eq('coupon_id', id)
  if (error) throw new Error(`Supabase: ${error.message}`)
  if (count) throw new CouponError('Kupon yang sudah pernah dipakai tidak bisa dihapus. Nonaktifkan saja.')
  try {
    unwrap(await db().from('coupons').delete().eq('id', id))
  } catch (error) {
    if (error instanceof Error && /foreign key/.test(error.message)) throw new CouponError('Kupon yang sudah pernah dipakai tidak bisa dihapus. Nonaktifkan saja.')
    throw error
  }
}
