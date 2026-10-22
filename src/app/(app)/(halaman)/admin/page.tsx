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
import { describeError, loadErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { ACTION_LABELS, CARD, CARD_TITLE, TABLE, TASK_LABELS, TD, TH } from './ui'

export const metadata: Metadata = { title: 'Admin' }

export default function AdminPage() {
  return (
    <Suspense fallback={<LoadingState variant="analytics" label="Memuat ringkasan…" />}>
      <Overview />
    </Suspense>
  )
}

async function Overview() {
  await connection()
  await requireAdmin()
  let data: { overview: AdminOverview; text: string; image: string; plan: Plan }
  try {
    const [overview, text, image, plan] = await Promise.all([getAdminOverview(), textModel(), imageModel(), getPlan()])
    data = { overview, text, image, plan }
  } catch (error) {
    console.error('[admin] ringkasan gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  const { overview, text, image, plan } = data
  const requests = overview.usage.reduce((sum, row) => sum + row.requests, 0)
  const failed = overview.usage.reduce((sum, row) => sum + row.failed, 0)
  const credits = overview.usage.reduce((sum, row) => sum + row.credits, 0)

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pengguna" value={formatCredits(overview.users)} />
        <Stat label="Langganan aktif" value={formatCredits(overview.activeUsers)} />
        <Stat label={`Permintaan AI ${overview.usageDays} hari`} value={formatCredits(requests)} />
        <Stat
          label="Gagal"
          value={requests === 0 ? '–' : `${Math.round((failed * 100) / requests)}%`}
          tone={requests > 0 && failed * 10 >= requests ? 'warning' : 'normal'}
        />
      </dl>

      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={CARD_TITLE}>Yang dipakai sekarang</h2>
          <Link href="/admin/pengaturan" className="text-sm font-medium text-zinc-900 underline">
            Ubah
          </Link>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Model teks</dt>
            <dd className="font-mono text-zinc-900">{text}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Model gambar</dt>
            <dd className="font-mono text-zinc-900">{image}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Paket</dt>
            <dd className="text-zinc-900">
              {plan.name} · {formatCredits(plan.credits)} kredit / {plan.days} hari
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className={CARD_TITLE}>
          Pemakaian AI per model, {overview.usageDays} hari terakhir ({formatCredits(credits)} kredit)
        </h2>
        {overview.usage.length === 0 ? (
          <p className="text-sm text-zinc-500">Belum ada permintaan AI.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className={TABLE}>
              <thead className="border-b border-zinc-100">
                <tr>
                  <th className={TH}>Model</th>
                  <th className={TH}>Permintaan</th>
                  <th className={TH}>Gagal</th>
                  <th className={TH}>Kredit</th>
                  <th className={TH}>Pengguna</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {overview.usage.map((row) => (
                  <tr key={row.model}>
                    <td className={`${TD} font-mono text-zinc-900`}>{row.model}</td>
                    <td className={TD}>{formatCredits(row.requests)}</td>
                    <td className={`${TD} ${row.failed > 0 ? 'text-red-700' : ''}`}>{formatCredits(row.failed)}</td>
                    <td className={TD}>{formatCredits(row.credits)}</td>
                    <td className={TD}>{formatCredits(row.users)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className={CARD_TITLE}>Permintaan AI gagal terbaru</h2>
        {overview.failures.length === 0 ? (
          <p className="text-sm text-zinc-500">Tidak ada.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
            {overview.failures.map((failure, index) => (
              <li key={index} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap gap-x-3 text-zinc-500">
                  <span>{formatDateTime(failure.createdAt)}</span>
                  <span>{TASK_LABELS[failure.task] ?? failure.task}</span>
                  <span className="font-mono">{failure.model}</span>
                  <span>{failure.email}</span>
                </p>
                <p className="break-words text-zinc-900">{failure.error ?? '(tanpa pesan)'}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className={CARD_TITLE}>Riwayat aksi admin</h2>
        {overview.log.length === 0 ? (
          <p className="text-sm text-zinc-500">Belum ada.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
            {overview.log.map((entry, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <span className="text-zinc-500">{formatDateTime(entry.createdAt)}</span>
                <span className="font-medium text-zinc-900">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                {entry.targetEmail && <span className="text-zinc-700">{entry.targetEmail}</span>}
                <span className="text-zinc-500">oleh {entry.adminEmail}</span>
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
function LogDetail({ detail }: { detail: Record<string, unknown> }) {
  const parts: string[] = []
  if (typeof detail.days === 'number') parts.push(`${detail.days} hari`)
  if (typeof detail.amount === 'number') parts.push(`${detail.amount > 0 ? '+' : ''}${formatCredits(detail.amount)} kredit`)
  if (typeof detail.note === 'string' && detail.note) parts.push(`"${detail.note}"`)
  if (parts.length === 0) return null
  return <span className="text-zinc-500">· {parts.join(' · ')}</span>
}
