
import type adminMessages from '@/../messages/id/admin.json'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { getAdminOverview, type AdminOverview } from '@/lib/admin'
import { formatCredits } from '@/lib/admin-options'
import { getPlan, imageModel, textModel } from '@/lib/app-settings'
import { requireAdmin } from '@/lib/auth'
import type { Plan } from '@/lib/billing-options'
import { ConfigError, describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { ACTION_LABELS, CARD, CARD_TITLE, TABLE, TASK_LABELS, TD, TH } from './ui'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin')
  return { title: t('page.admin') }
}

export default async function AdminPage() {
  const t = await getTranslations('admin')

  return (
    <Suspense fallback={<LoadingState variant="analytics" label={t('page.loadingOverview')} />}>
      <Overview />
    </Suspense>
  )
}

async function Overview() {
  const locale = await getLocale()

  const t = await getTranslations('admin')

  await connection()
  await requireAdmin()
  let data: { overview: AdminOverview; text: string; image: string; plan: Plan }
  try {
    const [overview, text, image, plan] = await Promise.all([getAdminOverview(), textModel(), imageModel(), getPlan()])
    data = { overview, text, image, plan }
  } catch (error) {
    console.error('[admin] ringkasan gagal dimuat:', describeError(error))
    return <Notice tone="warning">{error instanceof ConfigError ? t('loadErrors.configuration', { message: error.message }) : t('loadErrors.database')}</Notice>
  }
  const { overview, text, image, plan } = data
  const requests = overview.usage.reduce((sum, row) => sum + row.requests, 0)
  const failed = overview.usage.reduce((sum, row) => sum + row.failed, 0)
  const credits = overview.usage.reduce((sum, row) => sum + row.credits, 0)

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('page.users')} value={formatCredits(overview.users, locale)} />
        <Stat label={t('page.activeSubscriptions')} value={formatCredits(overview.activeUsers, locale)} />
        <Stat label={t('page.aiRequestsOverDays', { v0: overview.usageDays })} value={formatCredits(requests, locale)} />
        <Stat
          label={t('page.failed')}
          value={requests === 0 ? '–' : `${Math.round((failed * 100) / requests)}%`}
          tone={requests > 0 && failed * 10 >= requests ? 'warning' : 'normal'}
        />
      </dl>

      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={CARD_TITLE}>{t('page.currentlyInUse')}</h2>
          <Link href="/admin/pengaturan" className="text-sm font-medium text-zinc-900 underline">
            {t('page.edit')}</Link>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">{t('page.textModel')}</dt>
            <dd className="font-mono text-zinc-900">{text}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t('page.imageModel')}</dt>
            <dd className="font-mono text-zinc-900">{image}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t('page.plan')}</dt>
            <dd className="text-zinc-900">
              {plan.name} · {formatCredits(plan.credits, locale)} {t('page.credits')} {plan.days} {t('page.days')}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className={CARD_TITLE}>
          {t('page.usageHeading', { days: overview.usageDays, credits: formatCredits(credits, locale) })}</h2>
        {overview.usage.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('page.noAiRequestsYet')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className={TABLE}>
              <thead className="border-b border-zinc-100">
                <tr>
                  <th className={TH}>Model</th>
                  <th className={TH}>{t('page.requests')}</th>
                  <th className={TH}>{t('page.failed')}</th>
                  <th className={TH}>{t('page.credits3')}</th>
                  <th className={TH}>{t('page.users')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {overview.usage.map((row) => (
                  <tr key={row.model}>
                    <td className={`${TD} font-mono text-zinc-900`}>{row.model}</td>
                    <td className={TD}>{formatCredits(row.requests, locale)}</td>
                    <td className={`${TD} ${row.failed > 0 ? 'text-red-700' : ''}`}>{formatCredits(row.failed, locale)}</td>
                    <td className={TD}>{formatCredits(row.credits, locale)}</td>
                    <td className={TD}>{formatCredits(row.users, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className={CARD_TITLE}>{t('page.latestFailedAiRequests')}</h2>
        {overview.failures.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('page.none')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
            {overview.failures.map((failure, index) => (
              <li key={index} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap gap-x-3 text-zinc-500">
                  <span>{formatDateTime(failure.createdAt, locale)}</span>
                  <span>{(Object.hasOwn(TASK_LABELS, failure.task) ? t(`tasks.${failure.task as keyof typeof adminMessages.tasks}`) : failure.task)}</span>
                  <span className="font-mono">{failure.model}</span>
                  <span>{failure.email}</span>
                </p>
                <p className="break-words text-zinc-900">{failure.error ?? t('page.noMessage')}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className={CARD_TITLE}>{t('page.adminActionHistory')}</h2>
        {overview.log.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('page.noneYet')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
            {overview.log.map((entry, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <span className="text-zinc-500">{formatDateTime(entry.createdAt, locale)}</span>
                <span className="font-medium text-zinc-900">{(Object.hasOwn(ACTION_LABELS, entry.action) ? t(`actionsLabels.${entry.action as keyof typeof adminMessages.actionsLabels}`) : entry.action)}</span>
                {entry.targetEmail && <span className="text-zinc-700">{entry.targetEmail}</span>}
                <span className="text-zinc-500">{t('page.by')} {entry.adminEmail}</span>
                <LogDetail detail={entry.detail} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warning' }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tracking-tight ${tone === 'warning' ? 'text-amber-700' : 'text-zinc-900'}`}>
        {value}
      </dd>
    </div>
  )
}

/** The few details worth a glance: days, credits, a note. */
async function LogDetail({ detail }: { detail: Record<string, unknown> }) {
  const locale = await getLocale()

  const t = await getTranslations('admin')

  const parts: string[] = []
  if (typeof detail.days === 'number') parts.push(t('page.days3', { v0: detail.days }))
  if (typeof detail.amount === 'number') parts.push(t('page.credits4', { v0: detail.amount > 0 ? '+' : '', v1: formatCredits(detail.amount, locale) }))
  if (typeof detail.note === 'string' && detail.note) parts.push(`"${detail.note}"`)
  if (parts.length === 0) return null
  return <span className="text-zinc-500">· {parts.join(' · ')}</span>
}
