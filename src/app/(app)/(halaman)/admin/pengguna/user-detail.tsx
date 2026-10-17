import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { Notice } from '@/components/notice'
import { AdminError, getAdminUser, type AdminUserDetail } from '@/lib/admin'
import { formatCredits } from '@/lib/admin-options'
import { getPlan } from '@/lib/app-settings'
import { requireAdmin } from '@/lib/auth'
import { formatRupiah, usedPercent, type Plan } from '@/lib/billing-options'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { formatDateTime, formatShortDate } from '@/lib/format'
import { isUuid } from '@/lib/params'
import { CARD, CARD_TITLE, TASK_LABELS } from '../ui'
import { UserActions } from './user-actions'

const PAYMENT_LABELS = { paid: 'Lunas', pending: 'Menunggu', expired: 'Dibatalkan/kedaluwarsa' } as const

/** One user (`/admin/pengguna?id=`): facts, actions and history. */
export async function UserDetail({ id }: { id: string }) {
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
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  const { user, plan } = data
  const isSelf = user.id === admin.id

  return (
    <div className="space-y-6">
      <section className={CARD}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-zinc-900">{user.email || '(tanpa email)'}</h2>
          {isSelf && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">Anda</span>}
          {user.bannedUntil && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">Diblokir</span>}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Daftar">{formatDateTime(user.createdAt)}</Fact>
          <Fact label="Terakhir masuk">{user.lastSignInAt ? formatDateTime(user.lastSignInAt) : '–'}</Fact>
          <Fact label="Instagram">
            {user.instagram ? `@${user.instagram.username}${user.instagram.status === 'active' ? '' : ' (perlu sambung ulang)'}` : '–'}
          </Fact>
          <Fact label="Langganan">
            {user.period && user.activeUntil
              ? `Aktif s.d. ${formatDateTime(user.activeUntil)}`
              : user.activeUntil
                ? `Berakhir ${formatDateTime(user.activeUntil)}`
                : 'Belum pernah'}
          </Fact>
          <Fact label="Kredit periode ini">
            {user.creditsUsed === null
              ? '–'
              : `${formatCredits(user.creditsUsed)} / ${formatCredits(plan.credits)} (${usedPercent(user.creditsUsed, plan.credits)}%)`}
          </Fact>
          <Fact label="Post">{formatCredits(user.posts)}</Fact>
        </dl>
        {user.period && (
          <p className="text-xs text-zinc-500">
            Periode sekarang {formatShortDate(user.period.start)}–{formatShortDate(user.period.end)}. Kredit dihitung sejak
            awal periode.
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
        <h2 className={CARD_TITLE}>Permintaan AI terbaru</h2>
        {user.generations.length === 0 ? (
          <p className="text-sm text-zinc-500">Belum ada.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
            {user.generations.map((generation, index) => (
              <li key={index} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap gap-x-3 text-zinc-500">
                  <span>{formatDateTime(generation.createdAt)}</span>
                  <span className="text-zinc-900">{TASK_LABELS[generation.task] ?? generation.task}</span>
                  <span className="font-mono">{generation.model}</span>
                  <span>{formatCredits(generation.credits)} kredit</span>
                  <span>{(generation.durationMs / 1000).toFixed(1)} dtk</span>
                  {generation.status === 'failed' && <span className="text-red-700">Gagal</span>}
                </p>
                {generation.error && <p className="break-words text-red-700">{generation.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className={CARD_TITLE}>Penyesuaian kredit</h2>
          {user.adjustments.length === 0 ? (
            <p className="text-sm text-zinc-500">Belum ada.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
              {user.adjustments.map((adjustment, index) => (
                <li key={index} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                  <span className="text-zinc-500">{formatDateTime(adjustment.createdAt)}</span>
                  <span className={adjustment.amount > 0 ? 'text-emerald-700' : 'text-red-700'}>
                    {adjustment.amount > 0 ? '+' : ''}
                    {formatCredits(adjustment.amount)}
                  </span>
                  {adjustment.note && <span className="w-full text-zinc-600">{adjustment.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className={CARD_TITLE}>Riwayat pembayaran</h2>
          {user.payments.length === 0 ? (
            <p className="text-sm text-zinc-500">Belum ada.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
              {user.payments.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="text-zinc-700">{formatShortDate(payment.createdAt)}</span>
                  <span className="text-zinc-900">{payment.amount === 0 ? 'Gratis' : formatRupiah(payment.amount)}</span>
                  <span className="text-zinc-500">
                    {PAYMENT_LABELS[payment.status]}
                    {payment.periodStart && payment.periodEnd
                      ? ` · ${formatShortDate(payment.periodStart)}–${formatShortDate(payment.periodEnd)}`
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
