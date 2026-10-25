'use server'

import { revalidatePath } from 'next/cache'
import { currentUser, requireUser } from '@/lib/auth'
import { getCurrentPeriod, getUpgradeQuote, paymentsEnabled, quoteCheckout, startCheckout, startUpgradeCheckout, syncPendingPayments } from '@/lib/billing'
import { CouponError } from '@/lib/coupon-options'
import { describeError } from '@/lib/errors'
import { parseCustomerContact } from '@/lib/whatsapp'

/** The database's own coupon checks, raised when the last use went or the coupon changed between preview and pay. */
const COUPON_ERRORS: [string, string][] = [
  ['coupon_exhausted', 'Kuota kupon ini baru saja habis. Hapus kupon untuk lanjut tanpa diskon.'],
  ['coupon_used', 'Kupon ini sudah pernah kamu pakai.'],
  ['coupon_changed', 'Kupon ini baru saja diubah. Terapkan ulang kuponnya.'],
  ['coupon_invalid', 'Kupon ini tidak berlaku lagi untuk pesanan ini.'],
]

function billingError(error: unknown) {
  if (error instanceof CouponError) return error.message
  console.error('[billing]', describeError(error))
  const message = error instanceof Error ? error.message : ''
  const coupon = COUPON_ERRORS.find(([code]) => message.includes(code))
  if (coupon) return coupon[1]
  if (message.includes('checkout_pending')) return 'Masih ada pembayaran tertunda. Lanjutkan pembayaran tersebut atau tunggu tautannya kedaluwarsa.'
  if (message.includes('catalog_changed') || message.includes('subscription_changed')) return 'Paket atau harga berubah. Muat ulang Pengaturan dan hitung ulang biaya.'
  if (message && !message.startsWith('Supabase:') && !message.includes('fetch') && !message.includes('Mayar') && !message.includes('environment')) {
    // Only business-rule messages authored here, never provider/database diagnostics.
    if (/^(Paket|Langganan|Ada paket|Sisa biaya|Masa aktif|Hubungi tim|Ringkasan|Pembayaran sedang|Pembayaran belum diaktifkan|Harga diperbarui)/.test(message)) return message
  }
  return 'Pembayaran belum bisa disiapkan. Coba lagi sebentar lagi.'
}

export async function upgradeQuoteAction(planId: string) {
  const userId = await requireUser()
  if (typeof planId !== 'string' || planId.length > 40) return { error: 'Paket tidak valid.' }
  try { return { data: await getUpgradeQuote(userId, planId) } }
  catch (error) { return { error: billingError(error) } }
}

const validCouponCode = (value: unknown) => value === undefined || (typeof value === 'string' && value.length <= 40)

/** What the order costs with this coupon, for the summary before paying. Nothing is reserved yet. */
export async function couponPreviewAction(input: { planId: string; months: number; version: number; couponCode: string }) {
  const user = await currentUser()
  if (!user) return { error: 'Sesi berakhir. Masuk kembali untuk melanjutkan.' }
  if (!input || typeof input.planId !== 'string' || input.planId.length > 40 || !Number.isSafeInteger(input.version)
    || input.version < 1 || !Number.isSafeInteger(input.months) || typeof input.couponCode !== 'string' || !validCouponCode(input.couponCode)) {
    return { error: 'Kode kupon tidak valid.' }
  }
  if (!input.couponCode.trim()) return { error: 'Masukkan kode kupon.' }
  try {
    const quote = await quoteCheckout(user.id, input)
    if (!quote.coupon) return { error: 'Masukkan kode kupon.' }
    return { data: { code: quote.coupon.code, percent: quote.coupon.percent, couponDiscount: quote.couponDiscount ?? 0, total: quote.total } }
  } catch (error) { return { error: billingError(error) } }
}

export async function checkoutAction(input: {
  planId: string; months: number; version: number; upgradeToken?: string
  /** Applied coupon; only for a new or renewed subscription, never an upgrade. */
  couponCode?: string
  /** Who the bill is for: sent to Mayar and kept for WhatsApp follow-ups. */
  contact: { name: string; whatsapp: string }
}) {
  const user = await currentUser()
  if (!user) return { error: 'Sesi berakhir. Masuk kembali untuk melanjutkan.' }
  try {
    if (!input || typeof input.planId !== 'string' || !Number.isSafeInteger(input.version) || input.version < 1
      || !Number.isSafeInteger(input.months) || (input.upgradeToken !== undefined && typeof input.upgradeToken !== 'string')
      || !validCouponCode(input.couponCode) || (input.upgradeToken && input.couponCode?.trim())) {
      return { error: 'Pilihan paket tidak valid.' }
    }
    // A 100% coupon needs no payment, so only a paid checkout waits for payments to be switched on (startCheckout).
    if (input.upgradeToken && !paymentsEnabled()) return { error: 'Pembayaran belum diaktifkan.' }
    const contact = parseCustomerContact(input.contact)
    if ('error' in contact) return { error: contact.error, field: 'contact' as const }
    const link = input.upgradeToken
      ? await startUpgradeCheckout(user.id, user.email, contact, input.upgradeToken)
      : await startCheckout(user.id, user.email, contact, new Date(), { planId: input.planId, months: input.months, version: input.version, couponCode: input.couponCode })
    revalidatePath('/', 'layout')
    return { link }
  } catch (error) { return { error: billingError(error) } }
}

/** Whether a paid period covers now. Reads the database only, so the return page can poll it cheaply. */
export async function subscriptionActiveAction() {
  const user = await currentUser()
  if (!user) return { active: false }
  try { return { active: !!(await getCurrentPeriod(user.id)) } }
  catch { return { active: false } }
}

export async function checkPaymentAction() {
  const userId = await requireUser()
  try {
    await syncPendingPayments(userId)
    revalidatePath('/pengaturan')
    revalidatePath('/', 'layout')
    return { error: null }
  } catch (error) {
    console.error('[billing] pemeriksaan pembayaran:', describeError(error))
    return { error: 'Status pembayaran belum bisa diperiksa. Coba lagi sebentar lagi.' }
  }
}
