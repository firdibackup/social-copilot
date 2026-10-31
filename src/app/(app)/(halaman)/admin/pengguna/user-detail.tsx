import { intlLocale } from '@/i18n/locale-config'

import type adminMessages from '@/../messages/id/admin.json'
import { getLocale, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { Notice } from '@/components/notice'
import { AdminError, getAdminUser, type AdminUserDetail } from '@/lib/admin'
import { formatCredits } from '@/lib/admin-options'
import { getPlan } from '@/lib/app-settings'
import { requireAdmin } from '@/lib/auth'
import { formatRupiah, usedPercent, type Plan } from '@/lib/billing-options'
import { ConfigError, describeError } from '@/lib/errors'
import { formatDateTime, formatShortDate } from '@/lib/format'
import { isUuid } from '@/lib/params'
import { CARD, CARD_TITLE, TASK_LABELS } from '../ui'
import { UserActions } from './user-actions'

/** One user (`/admin/pengguna?id=`): facts, actions and history. */
export async function UserDetail({ id }: { id: string }) {
  const locale = await getLocale()

  const t = await getTranslations('admin')

  const PAYMENT_LABELS = { paid: t('pengguna_user_detail.paid'), pending: t('pengguna_user_detail.pending'), expired: t('pengguna_user_detail.canceledExpired') } as const

  await connection()
  const admin = await requireAdmin()
  if (!isUuid(id)) notFound()

  let data: { user: AdminUserDetail; plan: Plan }
  try {
    const [user, plan] = await Promise.all([getAdminUser(id), getPlan()])
    data = { user, plan }
  } catch (error) {
    if (error instanceof AdminError) notFound()
    console.error('[admin] pengguna gagal dimuat:', describeError(error))
    return <Notice tone="warning">{error instanceof ConfigError ? t('loadErrors.configuration', { message: error.message }) : t('loadErrors.database')}</Notice>
  }
  const { user, plan } = data
  const isSelf = user.id === admin.id

  return (
    <div className="space-y-6">
      <section className={CARD}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-zinc-900">{user.email || t('pengguna_user_detail.noEmail')}</h2>
          {isSelf && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{t('pengguna_user_detail.you')}</span>}
          {user.bannedUntil && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">{t('pengguna_user_detail.blocked')}</span>}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={t('pengguna_user_detail.joined')}>{formatDateTime(user.createdAt, locale)}</Fact>
          <Fact label={t('pengguna_user_detail.lastSignIn')}>{user.lastSignInAt ? formatDateTime(user.lastSignInAt, locale) : '–'}</Fact>
          <Fact label="Instagram">
            {user.instagram ? `@${user.instagram.username}${user.instagram.status === 'active' ? '' : t('pengguna_user_detail.reconnectNeeded')}` : '–'}
          </Fact>
          <Fact label={t('pengguna_user_detail.subscription')}>
            {user.period && user.activeUntil
              ? t('pengguna_user_detail.activeUntil', { v0: formatDateTime(user.activeUntil, locale) })
              : user.activeUntil
                ? t('pengguna_user_detail.ended', { v0: formatDateTime(user.activeUntil, locale) })
                : t('pengguna_user_detail.never')}
          </Fact>
          <Fact label={t('pengguna_user_detail.creditsThisPeriod')}>
            {user.creditsUsed === null
              ? '–'
              : `${formatCredits(user.creditsUsed, locale)} / ${formatCredits(user.creditsTotal ?? plan.credits, locale)} (${usedPercent(user.creditsUsed, user.creditsTotal ?? plan.credits)}%) · ${user.planName ?? ''}`}
          </Fact>
          <Fact label="Post">{formatCredits(user.posts, locale)}</Fact>
        </dl>
        {user.period && (
          <p className="text-xs text-zinc-500">
            {t('pengguna_user_detail.periodHint', { start: formatShortDate(user.period.start, locale), end: formatShortDate(user.period.end, locale) })}
          </p>
        )}
      </section>

      <UserActions
        userId={user.id}
        email={user.email}
        isSelf={isSelf}
        banned={user.bannedUntil !== null}
        hasPeriod={user.period !== null}
        planDays={plan.days}
      />

      <section className="space-y-3">
        <h2 className={CARD_TITLE}>{t('pengguna_user_detail.latestAiRequests')}</h2>
        {user.generations.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('pengguna_user_detail.noneYet')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
            {user.generations.map((generation, index) => (
              <li key={index} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap gap-x-3 text-zinc-500">
                  <span>{formatDateTime(generation.createdAt, locale)}</span>
                  <span className="text-zinc-900">{(Object.hasOwn(TASK_LABELS, generation.task) ? t(`tasks.${generation.task as keyof typeof adminMessages.tasks}`) : generation.task)}</span>
                  <span className="font-mono">{generation.model}</span>
                  <span>{formatCredits(generation.credits, locale)} {t('pengguna_user_detail.credits')}</span>
                  <span>{(generation.durationMs / 1000).toLocaleString(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} {t('pengguna_user_detail.sec')}</span>
                  {generation.status === 'failed' && <span className="text-red-700">{t('pengguna_user_detail.failed')}</span>}
                </p>
                {generation.error && <p className="break-words text-red-700">{generation.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className={CARD_TITLE}>{t('pengguna_user_detail.creditAdjustments')}</h2>
          {user.adjustments.length === 0 ? (
            <p className="text-sm text-zinc-500">{t('pengguna_user_detail.noneYet')}</p>
          ) : (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
              {user.adjustments.map((adjustment, index) => (
                <li key={index} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                  <span className="text-zinc-500">{formatDateTime(adjustment.createdAt, locale)}</span>
                  <span className={adjustment.amount > 0 ? 'text-emerald-700' : 'text-red-700'}>
                    {adjustment.amount > 0 ? '+' : ''}
                    {formatCredits(adjustment.amount, locale)}
                  </span>
                  {adjustment.note && <span className="w-full text-zinc-600">{adjustment.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className={CARD_TITLE}>{t('pengguna_user_detail.paymentHistory')}</h2>
          {user.payments.length === 0 ? (
            <p className="text-sm text-zinc-500">{t('pengguna_user_detail.noneYet')}</p>
          ) : (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
              {user.payments.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="text-zinc-700">{formatShortDate(payment.createdAt, locale)}</span>
                  <span className="text-zinc-900">{payment.amount === 0 ? t('pengguna_user_detail.free') : formatRupiah(payment.amount, locale)}</span>
                  <span className="text-zinc-500">
                    {PAYMENT_LABELS[payment.status]}
                    {payment.periodStart && payment.periodEnd
                      ? ` · ${formatShortDate(payment.periodStart, locale)}–${formatShortDate(payment.periodEnd, locale)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-900">{children}</dd>
    </div>
  )
}
