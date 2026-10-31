'use server'

import { getLocale, getMessages, getTranslations } from 'next-intl/server'

import { revalidatePath } from 'next/cache'
import { currentUser, requireUser } from '@/lib/auth'
import { getCurrentPeriod, getUpgradeQuote, paymentsEnabled, quoteCheckout, startCheckout, startUpgradeCheckout, syncPendingPayments } from '@/lib/billing'
import { CouponError } from '@/lib/coupon-options'
import { describeError } from '@/lib/errors'
import { CUSTOMER_NAME_MAX_LENGTH, parseCustomerContact } from '@/lib/whatsapp'

/** The database's own coupon checks, raised when the last use went or the coupon changed between preview and pay. */


async function billingError(error: unknown) {
  const t = await getTranslations('settings')

  const COUPON_ERRORS: [string, string][] = [
  ['coupon_exhausted', t('billing_actions.thisCouponHasJustRunOutRemove')],
  ['coupon_used', t('billing_actions.youVeAlreadyUsedThisCoupon')],
  ['coupon_changed', t('billing_actions.thisCouponHasJustChangedApplyIt')],
  ['coupon_invalid', t('billing_actions.thisCouponIsNoLongerValidFor')],
]

  if (error instanceof CouponError) return error.message
  const { billing } = await getMessages()
  // Only allow authored business-rule messages, never provider diagnostics.
  const authored = [billing.checkoutErrors, billing.upgradeErrors, billing.catalogErrors]
  if (error instanceof Error && authored.some((group) => Object.values(group as Record<string, string>).includes(error.message))) return error.message
  console.error('[billing]', describeError(error))
  const message = error instanceof Error ? error.message : ''
  const coupon = COUPON_ERRORS.find(([code]) => message.includes(code))
  if (coupon) return coupon[1]
  if (message.includes('checkout_pending')) return t('billing_actions.youHaveAPendingPaymentCompleteIt')
  if (message.includes('catalog_changed') || message.includes('subscription_changed')) return t('billing_actions.thePlanOrPriceHasChangedReload')
  return t('billing_actions.couldnTPrepareYourPaymentTryAgain')
}

export async function upgradeQuoteAction(planId: string) {
  const t = await getTranslations('settings')

  const userId = await requireUser()
  if (typeof planId !== 'string' || planId.length > 40) return { error: t('billing_actions.invalidPlan') }
  try { return { data: await getUpgradeQuote(userId, planId, new Date(), await getLocale()) } }
  catch (error) { return { error: await billingError(error) } }
}

const validCouponCode = (value: unknown) => value === undefined || (typeof value === 'string' && value.length <= 40)

/** What the order costs with this coupon, for the summary before paying. Nothing is reserved yet. */
export async function couponPreviewAction(input: { planId: string; months: number; version: number; couponCode: string }) {
  const t = await getTranslations('settings')

  const user = await currentUser()
  if (!user) return { error: t('billing_actions.yourSessionHasEndedSignInAgain') }
  if (!input || typeof input.planId !== 'string' || input.planId.length > 40 || !Number.isSafeInteger(input.version)
    || input.version < 1 || !Number.isSafeInteger(input.months) || typeof input.couponCode !== 'string' || !validCouponCode(input.couponCode)) {
    return { error: t('billing_actions.invalidCouponCode') }
  }
  if (!input.couponCode.trim()) return { error: t('billing_actions.enterACouponCode') }
  try {
    const quote = await quoteCheckout(user.id, input, new Date(), await getLocale())
    if (!quote.coupon) return { error: t('billing_actions.enterACouponCode') }
    return { data: { code: quote.coupon.code, percent: quote.coupon.percent, couponDiscount: quote.couponDiscount ?? 0, total: quote.total } }
  } catch (error) { return { error: await billingError(error) } }
}

export async function checkoutAction(input: {
  planId: string; months: number; version: number; upgradeToken?: string
  /** Applied coupon; only for a new or renewed subscription, never an upgrade. */
  couponCode?: string
  /** Who the bill is for: sent to Mayar and kept for WhatsApp follow-ups. */
  contact: { name: string; whatsapp: string }
}) {
  const t = await getTranslations('settings')

  const user = await currentUser()
  if (!user) return { error: t('billing_actions.yourSessionHasEndedSignInAgain') }
  try {
    if (!input || typeof input.planId !== 'string' || !Number.isSafeInteger(input.version) || input.version < 1
      || !Number.isSafeInteger(input.months) || (input.upgradeToken !== undefined && typeof input.upgradeToken !== 'string')
      || !validCouponCode(input.couponCode) || (input.upgradeToken && input.couponCode?.trim())) {
      return { error: t('billing_actions.invalidPlanSelection') }
    }
    // A 100% coupon needs no payment, so only a paid checkout waits for payments to be switched on (startCheckout).
    if (input.upgradeToken && !paymentsEnabled()) return { error: t('billing_actions.paymentsArenTEnabledYet') }
    const contact = parseCustomerContact(input.contact)
    if ('error' in contact) return {
      error: contact.error === 'Isi nama untuk tagihan.' ? t('contact.nameRequired')
        : contact.error.startsWith('Nama maksimal') ? t('contact.nameLength', { max: CUSTOMER_NAME_MAX_LENGTH }) : t('contact.whatsappInvalid'),
      field: 'contact' as const,
    }
    const link = input.upgradeToken
      ? await startUpgradeCheckout(user.id, user.email, contact, input.upgradeToken, new Date(), await getLocale())
      : await startCheckout(user.id, user.email, contact, new Date(), { planId: input.planId, months: input.months, version: input.version, couponCode: input.couponCode }, await getLocale())
    revalidatePath('/', 'layout')
    return { link }
  } catch (error) { return { error: await billingError(error) } }
}

/** Whether a paid period covers now. Reads the database only, so the return page can poll it cheaply. */
export async function subscriptionActiveAction() {
  const user = await currentUser()
  if (!user) return { active: false }
  try { return { active: !!(await getCurrentPeriod(user.id)) } }
  catch { return { active: false } }
}

export async function checkPaymentAction() {
  const t = await getTranslations('settings')

  const userId = await requireUser()
  try {
    await syncPendingPayments(userId)
    revalidatePath('/pengaturan')
    revalidatePath('/', 'layout')
    return { error: null }
  } catch (error) {
    console.error('[billing] pemeriksaan pembayaran:', describeError(error))
    return { error: t('billing_actions.couldnTCheckPaymentStatusTryAgain') }
  }
}
