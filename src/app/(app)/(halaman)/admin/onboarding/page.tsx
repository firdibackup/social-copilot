import { getLocale, getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireAdmin } from '@/lib/auth'
import { TRIAL_CHAT_MESSAGES, TRIAL_CONTENTS_CONNECTED, TRIAL_LIMITS } from '@/lib/billing-options'
import { ConfigError, describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { listOnboardingRecords } from '@/lib/onboarding-admin'
import { answerCounts, onboardingFunnel, type OnboardingRecord } from '@/lib/onboarding-admin-options'
import { isOnboardingStep } from '@/lib/onboarding-options'
import { BUTTON, CARD, CARD_TITLE, HINT, TABLE, TD, TH } from '../ui'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin')
  return { title: t('onboarding_page.title') }
}

export default async function OnboardingAdminPage() {
  const t = await getTranslations('admin')
  return (
    <Suspense fallback={<LoadingState variant="table" label={t('onboarding_page.loading')} />}>
      <Onboarding />
    </Suspense>
  )
}

/** The answers the wizard collects by choice, and the record field each lands in. */
const QUESTIONS = [
  ['goal', 'goal'],
  ['handler', 'handler'],
  ['skill', 'skillLevel'],
  ['frequency', 'postsLastMonth'],
  ['language', 'captionLanguage'],
] as const

async function Onboarding() {
  const t = await getTranslations('admin')
  const flow = await getTranslations('onboarding.flow')
  const locale = await getLocale()
  await connection()
  await requireAdmin()

  let records: OnboardingRecord[]
  try {
    records = await listOnboardingRecords()
  } catch (error) {
    console.error('[admin] onboarding gagal dimuat:', describeError(error))
    return <Notice tone="warning">{error instanceof ConfigError ? t('loadErrors.configuration', { message: error.message }) : t('loadErrors.database')}</Notice>
  }

  const funnel = onboardingFunnel(records)
  const started = funnel[0]?.reached ?? 0
  const finished = records.filter((record) => record.completedAt).length
  const sawPaywall = records.filter((record) => record.paywallShown > 0).length
  const paid = records.filter((record) => record.paid).length
  /** The label the wizard showed for an answer; an answer no longer offered shows as stored. */
  const labels = flow as unknown as { (key: string): string; has(key: string): boolean }
  const answerLabel = (question: string, answer: string) =>
    labels.has(`${question}.options.${answer}`) ? labels(`${question}.options.${answer}`) : answer

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{t('onboarding_page.title')}</h2>
          <p className={HINT}>{t('onboarding_page.description')}</p>
        </div>
        <a href="/api/admin/onboarding" className={BUTTON} download>{t('onboarding_page.export')}</a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['users', records.length], ['finished', finished], ['paywall', sawPaywall], ['paid', paid]] as const).map(([key, value]) => (
          <div key={key} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className={HINT}>{t(`onboarding_page.totals.${key}`)}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
          </div>
        ))}
      </div>

      <section className={CARD}>
        <h3 className={CARD_TITLE}>{t('onboarding_page.funnel')}</h3>
        <p className={HINT}>{t('onboarding_page.funnelHint')}</p>
        <ol className="space-y-1.5">
          {funnel.map(({ step, reached }) => (
            <li key={step} className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3 text-sm">
              <span className="truncate text-zinc-700">{t(`onboarding_page.steps.${step}`)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-zinc-100" role="presentation">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${started ? Math.round((reached / started) * 100) : 0}%` }} />
              </span>
              <span className="text-right font-medium text-zinc-900 tabular-nums">{reached}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {QUESTIONS.map(([question, field]) => {
          const counts = answerCounts(records.map((record) => record[field]))
          return (
            <section key={question} className={CARD}>
              <h3 className={CARD_TITLE}>{flow(`${question}.title`)}</h3>
              {counts.length === 0 ? <p className={HINT}>{t('onboarding_page.noAnswers')}</p> : (
                <ul className="space-y-1 text-sm">
                  {counts.map(({ answer, count }) => (
                    <li key={answer} className="flex justify-between gap-3">
                      <span className="text-zinc-700">{answerLabel(question, answer)}</span>
                      <span className="font-medium text-zinc-900 tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
        <section className={CARD}>
          <h3 className={CARD_TITLE}>{flow('referral.title')}</h3>
          <ul className="space-y-1 text-sm">
            {answerCounts(records.map((record) => record.referralSource)).slice(0, 8).map(({ answer, count }) => (
              <li key={answer} className="flex justify-between gap-3">
                <span className="truncate text-zinc-700">{answer}</span>
                <span className="font-medium text-zinc-900 tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className={TABLE}>
          <thead className="border-b border-zinc-200">
            <tr>
              {(['user', 'instagram', 'answers', 'step', 'trial', 'paywall', 'plan'] as const).map((column) => (
                <th key={column} scope="col" className={TH}>{t(`onboarding_page.columns.${column}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {records.map((record) => (
              <tr key={record.userId}>
                <td className={TD}>
                  <a href={`/admin/pengguna?id=${record.userId}`} className="font-medium text-zinc-900 underline-offset-2 hover:underline">{record.email || record.userId}</a>
                  <p className={HINT}>{formatDateTime(new Date(record.startedAt), locale)}</p>
                </td>
                <td className={TD}>
                  {record.igUsername ? (
                    <>
                      <p className="text-zinc-900">@{record.igUsername}</p>
                      <p className={HINT}>
                        {record.igVerified ? t('onboarding_page.verified') : t('onboarding_page.typed')}
                        {record.followers !== null && ` · ${t('onboarding_page.followers', { count: record.followers })}`}
                      </p>
                    </>
                  ) : <span className="text-zinc-500">{record.noInstagram ? t('onboarding_page.noInstagram') : '–'}</span>}
                  {record.name && <p className={HINT}>{record.name}</p>}
                </td>
                <td className={`${TD} max-w-xs text-zinc-700`}>
                  {[
                    record.goal && answerLabel('goal', record.goal),
                    record.handler && answerLabel('handler', record.handler),
                    record.skillLevel && answerLabel('skill', record.skillLevel),
                    record.postsLastMonth && answerLabel('frequency', record.postsLastMonth),
                    record.postsPerWeek > 0 && t('onboarding_page.perWeek', { count: record.postsPerWeek }),
                    record.captionLanguage && answerLabel('language', record.captionLanguage),
                  ].filter(Boolean).join(' · ') || '–'}
                  {record.website && <p className={`${HINT} truncate`}>{record.website}</p>}
                  {record.referralSource && <p className={HINT}>{t('onboarding_page.from', { source: record.referralSource })}</p>}
                </td>
                <td className={TD}>
                  {record.completedAt
                    ? <span className="text-emerald-700">{t('onboarding_page.done')}</span>
                    : <span className="text-amber-700">{isOnboardingStep(record.lastStep) ? t(`onboarding_page.steps.${record.lastStep}`) : '–'}</span>}
                </td>
                <td className={`${TD} whitespace-nowrap text-zinc-700 tabular-nums`}>
                  {t('onboarding_page.usage', {
                    contents: record.contentUsed, contentLimit: TRIAL_CONTENTS_CONNECTED,
                    chats: record.chatUsed, chatLimit: TRIAL_CHAT_MESSAGES,
                    revisions: record.revisionUsed, revisionLimit: TRIAL_LIMITS.revision,
                  })}
                </td>
                <td className={`${TD} whitespace-nowrap text-zinc-700 tabular-nums`}>
                  {record.paywallShown === 0 ? '–' : t('onboarding_page.paywall', { shown: record.paywallShown, clicked: record.paywallClicked })}
                </td>
                <td className={TD}>
                  {record.paid ? <span className="font-medium text-emerald-700">{t('onboarding_page.paid')}</span> : <span className="text-zinc-500">{t('onboarding_page.free')}</span>}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td className={TD} colSpan={7}><span className="text-zinc-500">{t('onboarding_page.empty')}</span></td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
