'use client'

import { Check, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { paywallAction, paywallClickAction, type PaywallData } from '@/app/paywall/actions'
import { TRIAL_CHAT_MESSAGES, TRIAL_LIMITS, formatRupiah, trialLimitMessage } from '@/lib/billing-options'
import { paywallReason, type PaywallTrigger } from '@/lib/paywall-options'
import { resolveLocale } from '@/i18n/locale-config'
import { commonTranslations } from './client-translations'
import { confirmDialog } from './confirm-dialog'

export const UPGRADE_HREF = '/langganan'

/**
 * The trial answers of code deployed before the free-access change. The worker is deployed apart from the site
 * and may still send them.
 */
const EARLIER_LIMITS = [
  'Kredit gratis kamu habis (sisa 0). Upgrade ke Pro atau Max untuk lanjut.',
  'Your free credits are used up (0 left). Upgrade to Pro or Max to continue.',
]

/** Whether an answer from the server means the free trial doesn't cover it or is used up. */
export function isTrialLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : error
  return typeof message === 'string' && [trialLimitMessage('id'), trialLimitMessage('en'), ...EARLIER_LIMITS].includes(message.trim())
}

let showing = false

/**
 * The paywall: what the trial gave, the plan on sale at each duration, and one button to Langganan with that plan
 * and duration picked. `trigger` is what the user was doing; `navigate` is the caller's `router.push`.
 */
export async function showUpgradeDialog(navigate: (href: string) => void, trigger: PaywallTrigger = 'limit'): Promise<void> {
  const t = commonTranslations()
  if (showing) return
  showing = true
  try {
    const data = await paywallAction(trigger).catch(() => null)
    const offer = data?.offer ?? null
    let months = offer?.durations[0]?.months ?? 1
    const upgrade = await confirmDialog({
      title: t('trial.title'),
      description: data && offer
        ? <Paywall data={data} trigger={trigger} onMonths={(picked) => { months = picked }} />
        : <p>{t('trial.plain')}</p>,
      confirmLabel: t('trial.upgrade'),
      cancelLabel: t('trial.later'),
      icon: Sparkles,
    })
    if (!upgrade) return
    void paywallClickAction(trigger, months).catch(() => undefined)
    navigate(offer ? `${UPGRADE_HREF}?paket=${encodeURIComponent(offer.plan.id)}&bulan=${months}` : UPGRADE_HREF)
  } finally {
    showing = false
  }
}

interface PaywallProps {
  data: PaywallData
  trigger: PaywallTrigger
  onMonths: (months: number) => void
}

function Paywall({ data, trigger, onMonths }: PaywallProps) {
  const t = commonTranslations()
  const locale = resolveLocale(typeof document === 'undefined' ? undefined : document.documentElement.lang)
  const { status } = data
  const offer = data.offer!
  const [months, setMonths] = useState(offer.durations[0].months)
  const duration = offer.durations.find((item) => item.months === months) ?? offer.durations[0]
  const used = status && [
    t('trial.usedContent', { used: Math.min(status.contentUsed, status.contentLimit), limit: status.contentLimit }),
    t('trial.usedChat', { used: Math.min(status.chatUsed, TRIAL_CHAT_MESSAGES), limit: TRIAL_CHAT_MESSAGES }),
    t('trial.usedRevision', { used: Math.min(status.revisionUsed, TRIAL_LIMITS.revision), limit: TRIAL_LIMITS.revision }),
  ]

  return (
    <div className="space-y-3 text-left">
      <p>{t('trial.lead', { posts: offer.plan.posts })}</p>
      {used && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('trial.usedLabel')}>
          {used.map((item) => (
            <li key={item} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-ink-muted">{item}</li>
          ))}
        </ul>
      )}
      {status && !status.connected && status.contentUsed >= status.contentLimit && (
        <p className="rounded-xl bg-accent/10 px-3 py-2 text-xs text-ink">
          {t.rich('trial.connectBonus', { a: (chunks) => <a href="/pengaturan#instagram" className="font-semibold text-accent underline underline-offset-2">{chunks}</a> })}
        </p>
      )}

      {offer.durations.length > 1 && (
        <div role="radiogroup" aria-label={t('trial.duration')} className="grid grid-cols-4 gap-1 rounded-xl bg-zinc-100 p-1">
          {offer.durations.map((item) => (
            <button
              key={item.months}
              type="button"
              role="radio"
              aria-checked={item.months === months}
              onClick={() => { setMonths(item.months); onMonths(item.months) }}
              className={`rounded-lg px-1 py-1.5 text-xs font-medium transition-colors ${item.months === months ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
            >
              {t('trial.months', { count: item.months })}
              {item.discount > 0 && <span className="block text-[10px] font-semibold text-emerald-700">−{item.discount}%</span>}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-accent/40 bg-accent/5 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold text-ink">Carousely {offer.plan.name}</span>
          <span className="text-right text-ink">
            <strong className="text-base font-semibold">{formatRupiah(duration.monthly, locale)}</strong>
            <span className="text-xs text-ink-muted">{t('trial.perMonth')}</span>
          </span>
        </div>
        {duration.months > 1 && (
          <p className="mt-0.5 text-right text-xs text-ink-muted">
            {t('trial.total', { total: formatRupiah(duration.total, locale), count: duration.months })}
          </p>
        )}
        <ul className="mt-2 space-y-1 text-xs text-ink">
          {[t('trial.perkPosts', { posts: offer.plan.posts }), t('trial.perkChat'), t('trial.perkSchedule')].map((perk) => (
            <li key={perk} className="flex gap-1.5">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
              {perk}
            </li>
          ))}
        </ul>
      </div>

      <p className="flex gap-1.5 text-xs font-medium text-ink">
        <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
        {t(`trial.after.${paywallReason(trigger, status)}`)}
      </p>
      {offer.waitlist.length > 0 && <p className="text-xs">{t('trial.waitlist', { plans: offer.waitlist.join(' & ') })}</p>}
      <p className="text-xs">{t('trial.secure')}</p>
    </div>
  )
}
