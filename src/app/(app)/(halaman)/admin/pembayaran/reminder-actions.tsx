'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { markRemindedAction } from '../actions'
import { BUTTON } from '../ui'

const WHATSAPP_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1DA851] px-3 py-2 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-[#178F44] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1DA851]'

/** Opens the WhatsApp chat and records the reminder without holding up the new tab. */
export function ReminderActions({ paymentId, chatHref, payLink }: { paymentId: string; chatHref: string | null; payLink: string | null }) {
  const t = useTranslations('admin')

  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function remind() {
    setError(null)
    markRemindedAction(paymentId)
      .then((result) => setError(result.error))
      .catch(() => setError(t('pembayaran_reminder_actions.couldnTRecordTheReminder')))
  }

  async function copy() {
    if (!payLink) return
    try {
      await navigator.clipboard.writeText(payLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(t('pembayaran_reminder_actions.couldnTCopyTheLink'))
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {chatHref ? (
          <a href={chatHref} target="_blank" rel="noreferrer" onClick={remind} className={WHATSAPP_BUTTON}>
            <MessageCircle size={15} aria-hidden="true" />
            {t('pembayaran_reminder_actions.chatOnWhatsapp')}</a>
        ) : (
          <span className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs whitespace-nowrap text-zinc-400">{t('pembayaran_reminder_actions.noNumber')}</span>
        )}
        {payLink && (
          <button type="button" onClick={copy} className={`${BUTTON} whitespace-nowrap`}>
            {copied ? <Check size={15} className="text-emerald-600" aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copied ? t('pembayaran_reminder_actions.copied') : t('pembayaran_reminder_actions.copyPaymentLink')}
          </button>
        )}
      </div>
      <span aria-live="polite" className="text-xs text-red-700">{error}</span>
    </div>
  )
}
