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

/** The sidebar's KREDIT meter, linking to the subscription page. */
export async function CreditMeter() {
  const percent = await loadUsage()
  return <CreditBar percent={percent} />
}

export function CreditBar({ percent }: { percent: number | null }) {
  return (
    <Link href="/langganan" className="block space-y-1.5 rounded-lg px-3 py-2 transition-colors hover:bg-white">
      <span className="flex justify-between text-xs">
        <span className="text-ink-muted">Kuota AI</span>
        <span className="font-medium text-ink">{percent === null ? '–' : `${percent}% terpakai`}</span>
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-zinc-200/80" role="presentation">
        <span
          className={`block h-full rounded-full transition-[width] duration-300 ${percent !== null && percent >= 90 ? 'bg-amber-500' : 'bg-accent'}`}
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
  const renewal = await loadRenewal()
  if (!renewal) return null
  return (
    <p role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-800">
      Langganan berakhir {renewal.daysLeft <= 1 ? 'dalam 1 hari' : `${renewal.daysLeft} hari lagi`} (
      {formatDateTime(renewal.activeUntil)}).{' '}
      <Link href="/langganan" className="font-medium underline">
        Perpanjang
      </Link>
    </p>
  )
}
