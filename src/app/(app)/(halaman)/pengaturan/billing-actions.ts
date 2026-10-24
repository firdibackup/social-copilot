'use server'

import { revalidatePath } from 'next/cache'
import { currentUser, requireUser } from '@/lib/auth'
import { getCurrentPeriod, getUpgradeQuote, paymentsEnabled, startCheckout, startUpgradeCheckout, syncPendingPayments } from '@/lib/billing'
import { describeError } from '@/lib/errors'
import { parseCustomerContact } from '@/lib/whatsapp'

function billingError(error: unknown) {
  console.error('[billing]', describeError(error))
  const message = error instanceof Error ? error.message : ''
  if (message.includes('checkout_pending')) return 'Masih ada pembayaran tertunda. Lanjutkan pembayaran tersebut atau tunggu tautannya kedaluwarsa.'
  if (message.includes('catalog_changed') || message.includes('subscription_changed')) return 'Paket atau harga berubah. Muat ulang Pengaturan dan hitung ulang biaya.'
  if (message && !message.startsWith('Supabase:') && !message.includes('fetch') && !message.includes('Mayar') && !message.includes('environment')) {
    // Only business-rule messages authored here, never provider/database diagnostics.
    if (/^(Paket|Langganan|Ada paket|Sisa biaya|Masa aktif|Hubungi tim|Ringkasan|Pembayaran sedang|Harga diperbarui)/.test(message)) return message
  }
  return 'Pembayaran belum bisa disiapkan. Coba lagi sebentar lagi.'
}

export async function upgradeQuoteAction(planId: string) {
  const userId = await requireUser()
  if (typeof planId !== 'string' || planId.length > 40) return { error: 'Paket tidak valid.' }
  try { return { data: await getUpgradeQuote(userId, planId) } }
  catch (error) { return { error: billingError(error) } }
}

export async function checkoutAction(input: {
  planId: string; months: number; version: number; upgradeToken?: string
  /** Who the bill is for: sent to Mayar and kept for WhatsApp follow-ups. */
  contact: { name: string; whatsapp: string }
}) {
  const user = await currentUser()
  if (!user) return { error: 'Sesi berakhir. Masuk kembali untuk melanjutkan.' }
  if (!paymentsEnabled()) return { error: 'Pembayaran belum diaktifkan.' }
  try {
    if (!input || typeof input.planId !== 'string' || !Number.isSafeInteger(input.version) || input.version < 1
      || !Number.isSafeInteger(input.months) || (input.upgradeToken !== undefined && typeof input.upgradeToken !== 'string')) {
      return { error: 'Pilihan paket tidak valid.' }
    }
    const contact = parseCustomerContact(input.contact)
    if ('error' in contact) return { error: contact.error, field: 'contact' as const }
    const link = input.upgradeToken
      ? await startUpgradeCheckout(user.id, user.email, contact, input.upgradeToken)
      : await startCheckout(user.id, user.email, contact, new Date(), input)
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
