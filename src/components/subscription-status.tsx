import Link from 'next/link'
import { connection } from 'next/server'
import type { ComponentProps } from 'react'
import { currentPeriod, requireActiveUser } from '@/lib/auth'
import { getUsage } from '@/lib/billing'
import { describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { StatusLine } from './instagram-status'

const DAY_MS = 24 * 60 * 60 * 1000
const WARN_DAYS = 3

async function loadUsage(): Promise<ComponentProps<typeof StatusLine> | null> {
  await connection()
  const userId = await requireActiveUser()
  try {
    const period = await currentPeriod(userId)
    if (!period) return null
    const { percent } = await getUsage(userId, period)
    return { tone: percent >= 90 ? 'warning' : 'ok', label: `Kuota AI ${percent}% terpakai` }
  } catch (error) {
    console.error('[langganan] status sidebar gagal:', describeError(error))
    return { tone: 'muted', label: 'Kuota tidak tersedia' }
  }
}

/** Sidebar line under Langganan: the share of this period's AI credits already spent. */
export async function SubscriptionStatus() {
  const status = await loadUsage()
  return status && <StatusLine {...status} />
}

/** When the subscription ends within WARN_DAYS days, how many are left; otherwise null. */
async function loadRenewal(): Promise<{ daysLeft: number; activeUntil: Date } | null> {
  await connection()
  const userId = await requireActiveUser()
  const period = await currentPeriod(userId).catch(() => null)
  if (!period) return null
  const daysLeft = Math.ceil((period.activeUntil.getTime() - new Date().getTime()) / DAY_MS)
  return daysLeft > WARN_DAYS ? null : { daysLeft, activeUntil: period.activeUntil }
}

/** Shown over every app page near the end; there is no email reminder without SMTP. */
export async function RenewalBanner() {
  const renewal = await loadRenewal()
  if (!renewal) return null
  return (
    <p role="status" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Langganan berakhir {renewal.daysLeft <= 1 ? 'dalam 1 hari' : `${renewal.daysLeft} hari lagi`} (
      {formatDateTime(renewal.activeUntil)}).{' '}
      <Link href="/langganan" className="font-medium underline">
        Perpanjang
      </Link>
    </p>
  )
}
