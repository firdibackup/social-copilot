'use client'

import { useTranslations } from 'next-intl'

import { Globe } from 'lucide-react'
import Link from 'next/link'
import { useActionState } from 'react'
import { importWebsiteAction, type WebsiteImportState } from './actions'
import { Feedback, INITIAL_STATE, PRIMARY_BUTTON } from './ui'

const INITIAL_IMPORT: WebsiteImportState = { ...INITIAL_STATE, pages: 0, imported: 0, duplicates: 0, warnings: [] }

/** Imports the photos of the website saved in Brand; the address itself is changed there. */
export function WebsiteCard({ websiteUrl, creditCost }: { websiteUrl: string; creditCost: number }) {
  const t = useTranslations('assets')
  const [state, action, pending] = useActionState(importWebsiteAction, INITIAL_IMPORT)
  const host = websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

  return (
    <section aria-labelledby="website-judul" className="rounded-xl border border-hairline bg-paper p-4">
      <h2 id="website-judul" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Globe size={16} aria-hidden="true" />
        {t('websiteCard.text1')}</h2>
      {websiteUrl ? (
        <form action={action} className="mt-2 space-y-3">
          <input type="hidden" name="url" value={websiteUrl} />
          <p className="truncate text-sm text-ink" title={websiteUrl}>
            {host}
          </p>
          <p className="text-xs text-ink-muted">
            {t('websiteCard.text2')}{' '}
            {t('websiteCard.creditCost', { count: creditCost })}</p>
          <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} w-full`}>
            {pending ? t('websiteCard.text4') : t('websiteCard.text5')}
          </button>
          <div className="space-y-1" aria-live="polite">
            <Feedback state={state} />
            {state.success && state.error && (
              <p className="text-xs text-ink-muted">{t('websiteCard.text6')}</p>
            )}
            {state.warnings.map((warning) => (
              <p key={warning} className="text-xs text-amber-700">
                {warning}
              </p>
            ))}
          </div>
          <Link href="/brand" className="inline-block text-xs font-medium text-accent hover:text-accent-deep">
            {t('websiteCard.text7')}</Link>
        </form>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          {t('websiteCard.text8')}{' '}
          <Link href="/brand" className="font-medium text-accent hover:text-accent-deep">
            {t('websiteCard.text9')}</Link>{' '}
          {t('websiteCard.text10')}</p>
      )}
    </section>
  )
}
