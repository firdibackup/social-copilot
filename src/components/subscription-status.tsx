import { useTranslations } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { connection } from 'next/server'
import { currentPeriod, requireUser } from '@/lib/auth'
import { getUsage } from '@/lib/billing'
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
