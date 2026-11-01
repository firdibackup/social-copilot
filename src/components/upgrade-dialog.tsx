'use client'

import { Sparkles } from 'lucide-react'
import { trialLimitMessage } from '@/lib/billing-options'
import { commonTranslations } from './client-translations'
import { confirmDialog } from './confirm-dialog'

export const UPGRADE_HREF = '/langganan'

/** Whether an answer from the server means the free trial doesn't cover it or is used up. */
export function isTrialLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : error
  return typeof message === 'string' && [trialLimitMessage('id'), trialLimitMessage('en')].includes(message.trim())
}

let showing = false

/** "Kredit gratis kamu habis", with Pro and Max, and a button to Langganan. `navigate` is the caller's `router.push`. */
export async function showUpgradeDialog(navigate: (href: string) => void): Promise<void> {
  const t = commonTranslations()
  if (showing) return
  showing = true
  try {
    const upgrade = await confirmDialog({
      title: t('trial.title'),
      description: (
        <>
          <p>{t('trial.left')}</p>
          <ul className="mt-2 space-y-1.5">
            <li><strong className="font-semibold text-ink">Pro</strong> · {t('trial.pro')}</li>
            <li><strong className="font-semibold text-ink">Max</strong> · {t('trial.max')}</li>
          </ul>
        </>
      ),
      confirmLabel: t('trial.upgrade'),
      cancelLabel: t('trial.later'),
      icon: Sparkles,
    })
    if (upgrade) navigate(UPGRADE_HREF)
  } finally {
    showing = false
  }
}
