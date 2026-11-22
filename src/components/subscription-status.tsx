import { useTranslations } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { connection } from 'next/server'
import { trialStatus } from '@/lib/ai'
import { currentPeriod, requireUser } from '@/lib/auth'
import { getUsage } from '@/lib/billing'
import { TRIAL_CHAT_MESSAGES, TRIAL_LIMITS } from '@/lib/billing-options'
import { describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'

const DAY_MS = 24 * 60 * 60 * 1000
const WARN_DAYS = 3

/** The share of this period's AI credits spent, or null when it can't be read (logged). */
async function loadUsage(): Promise<number | null> {
  await connection()
  const userId = await requireUser()
  try {
    const period = await currentPeriod(userId)
    return period ? (await getUsage(userId, period)).percent : null
  } catch (error) {
    console.error('[langganan] kredit sidebar gagal:', describeError(error))
    return null
  }
}

/** The sidebar's KREDIT meter links to the billing section in settings. */
export async function CreditMeter() {
  const percent = await loadUsage()
  return <CreditBar percent={percent} />
}

export function CreditBar({ percent }: { percent: number | null }) {
  const t = useTranslations('shell')
  return (
    <Link href="/pengaturan#paket" className="block min-h-11 space-y-2 rounded-[10px] px-3 py-2 transition-colors duration-150 hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-[-2px]">
      <span className="flex justify-between text-xs">
        <span className="text-ink-muted">{t('quota')}</span>
        <span className="font-medium text-ink">{percent === null ? '–' : t('used', { percent })}</span>
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-[#e3e0f5]" role="presentation">
        <span
          className={`block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${percent !== null && percent >= 90 ? 'bg-amber-500' : 'bg-signature'}`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </span>
    </Link>
  )
}

/** When the subscription ends within WARN_DAYS days, how many are left; otherwise null. */
async function loadRenewal(): Promise<{ daysLeft: number; activeUntil: Date } | null> {
  await connection()
  const userId = await requireUser()
  const period = await currentPeriod(userId).catch(() => null)
  if (!period) return null
  const daysLeft = Math.ceil((period.activeUntil.getTime() - new Date().getTime()) / DAY_MS)
  return daysLeft > WARN_DAYS ? null : { daysLeft, activeUntil: period.activeUntil }
}

/** A strip under the header of every app page near the end; there is no email reminder without SMTP. */
export async function RenewalBanner() {
  const t = await getTranslations('shell')
  const locale = await getLocale()
  const renewal = await loadRenewal()
  if (!renewal) return null
  return (
    <p role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-800">
      {t('renewal', { days: Math.max(1, renewal.daysLeft), date: formatDateTime(renewal.activeUntil, locale) })}{' '}
      <Link href="/pengaturan?billing=perpanjang" className="font-medium underline">
        {t('renew')}
      </Link>
    </p>
  )
}

/**
 * For a user on the free trial, a strip under the header of every app page: what is left of it, how to open the
 * last free carousel (the Instagram login), and the way to the plans.
 */
export async function TrialBanner() {
  await connection()
  const t = await getTranslations('shell')
  const userId = await requireUser()
  const status = await trialStatus(userId).catch((error: unknown) => {
    console.error('[langganan] jatah gratis gagal dibaca:', describeError(error))
    return null
  })
  if (!status) return null
  const left = (limit: number, used: number) => Math.max(0, limit - used)
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-accent/20 bg-accent/5 px-5 py-2 text-sm text-ink">
      <span>
        {t('trial.left', {
          contents: left(status.contentLimit, status.contentUsed),
          chats: left(TRIAL_CHAT_MESSAGES, status.chatUsed),
          revisions: left(TRIAL_LIMITS.revision, status.revisionUsed),
        })}
      </span>
      {!status.connected && (
        <Link href="/pengaturan#instagram" className="font-medium text-accent underline underline-offset-2">
          {t('trial.connect')}
        </Link>
      )}
      <Link href="/langganan" className="font-medium underline underline-offset-2">
        {t('trial.plans')}
      </Link>
    </p>
  )
}
