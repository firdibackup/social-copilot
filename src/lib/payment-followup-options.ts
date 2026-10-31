import { createTranslator } from 'next-intl'
import { intlLocale, type Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/billing.json'
import enMessages from '../../messages/en/billing.json'
/** Admin follow-ups on unfinished Mayar checkouts: the WhatsApp message. Pure, shared by the page and tests. */
import { formatRupiah } from './billing-options'

export interface UnfinishedPayment {
  paymentId: string
  userId: string
  email: string
  /** The name given at checkout; null for checkouts from before the form asked. */
  name: string | null
  /** International digits, e.g. "6281234567890". */
  whatsapp: string | null
  planName: string | null
  months: number | null
  /** The coupon applied at checkout, if any. */
  couponCode?: string | null
  kind: 'subscription' | 'upgrade'
  amount: number
  /** "pending" while the Mayar link can still be paid. */
  status: 'pending' | 'expired'
  createdAt: Date
  expiresAt: Date | null
  link: string | null
  remindedAt: Date | null
  reminderCount: number
  /** Unfinished checkouts of this user in the window, this one included. */
  attempts: number
}

const timeFormat = (locale: Locale) => new Intl.DateTimeFormat(intlLocale(locale), {
  day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta', timeZoneName: 'short',
})

/** The chat an admin starts from the dashboard. `subscribeUrl` is where a new link is made once the old one expired. */
export function reminderMessage(payment: UnfinishedPayment, subscribeUrl: string, locale: Locale = 'id'): string {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'reminder' })
  const greeting = t('greeting', { name: payment.name ? ` ${payment.name}` : '' })
  const order = `${t(payment.kind === 'upgrade' ? 'upgrade' : 'plan')} ${payment.planName ?? 'Carousely'}${payment.months && payment.kind !== 'upgrade' ? t('months', { count: payment.months }) : ''} (${formatRupiah(payment.amount, locale)})`
  if (payment.status === 'pending' && payment.link) {
    const until = payment.expiresAt ? t('until', { date: timeFormat(locale).format(payment.expiresAt) }) : ''
    return t('pending', { greeting, order, link: payment.link, until })
  }
  return t('expired', { greeting, order, url: subscribeUrl })
}
