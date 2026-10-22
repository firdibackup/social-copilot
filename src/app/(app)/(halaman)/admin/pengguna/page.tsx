import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { listAdminUsers, type AdminUser } from '@/lib/admin'
import { formatCredits } from '@/lib/admin-options'
import { getPlan } from '@/lib/app-settings'
import { requireAdmin } from '@/lib/auth'
import { usedPercent, type Plan } from '@/lib/billing-options'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { formatShortDate } from '@/lib/format'
import { firstValue, type SearchParams } from '@/lib/params'
import { BUTTON, FIELD, TABLE, TD, TH } from '../ui'
import { UserDetail } from './user-detail'

export const metadata: Metadata = { title: 'Pengguna · Admin' }

interface PenggunaPageProps {
  searchParams: Promise<SearchParams>
}

export default function PenggunaPage({ searchParams }: PenggunaPageProps) {
  return (
    <Suspense fallback={<LoadingState variant="table" label="Memuat pengguna…" />}>
      <Users searchParams={searchParams} />
    </Suspense>
  )
}

/** The list, or one user with `?id=`. A query parameter rather than a [id] segment, as in Buat. */
async function Users({ searchParams }: PenggunaPageProps) {
  await connection()
  await requireAdmin()
  const params = await searchParams
  const id = firstValue(params.id)
  if (id) {
    return (
      <div className="space-y-4">
        <Link href="/admin/pengguna" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Semua pengguna
        </Link>
        <UserDetail id={id} />
      </div>
    )
  }
  const query = firstValue(params.q)?.trim() ?? ''

  let data: { users: AdminUser[]; plan: Plan }
  try {
    const [users, plan] = await Promise.all([listAdminUsers(query), getPlan()])
    data = { users, plan }
  } catch (error) {
    console.error('[admin] daftar pengguna gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  const { users, plan } = data
  const now = new Date()

  return (
    <div className="space-y-4">
      {firstValue(params.dihapus) === '1' && <Notice tone="success">Pengguna dihapus beserta datanya.</Notice>}
      <form role="search" className="flex max-w-md gap-2">
        <input
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Cari email atau username Instagram"
          aria-label="Cari pengguna"
          className={FIELD}
        />
        <button type="submit" className={BUTTON}>
          Cari
        </button>
      </form>

      {users.length === 0 ? (
        <p className="text-sm text-zinc-500">{query ? 'Tidak ada pengguna yang cocok.' : 'Belum ada pengguna.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className={TABLE}>
            <thead className="border-b border-zinc-100">
              <tr>
                <th className={TH}>Pengguna</th>
                <th className={TH}>Instagram</th>
                <th className={TH}>Langganan</th>
                <th className={TH}>Kredit periode ini</th>
                <th className={TH}>Daftar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-50">
                  <td className={TD}>
                    <Link href={`/admin/pengguna?id=${user.id}`} className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                      {user.email || '(tanpa email)'}
                    </Link>
                    {user.bannedUntil && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">Diblokir</span>}
                  </td>
                  <td className={`${TD} text-zinc-700`}>
                    {user.instagram ? (
                      <>
                        @{user.instagram.username}
                        {user.instagram.status !== 'active' && <span className="ml-1 text-xs text-amber-700">(perlu sambung ulang)</span>}
                      </>
                    ) : (
                      <span className="text-zinc-400">–</span>
                    )}
                  </td>
                  <td className={TD}>
                    <SubscriptionCell user={user} now={now} />
                  </td>
                  <td className={TD}>
                    {user.creditsUsed === null ? (
                      <span className="text-zinc-400">–</span>
                    ) : (
                      <span className="text-zinc-700">
                        {formatCredits(user.creditsUsed)} / {formatCredits(plan.credits)}{' '}
                        <span className="text-zinc-500">({usedPercent(user.creditsUsed, plan.credits)}%)</span>
                      </span>
                    )}
                  </td>
                  <td className={`${TD} text-zinc-500`}>{formatShortDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SubscriptionCell({ user, now }: { user: AdminUser; now: Date }) {
  if (user.period && user.activeUntil) {
    return <span className="text-emerald-700">Aktif s.d. {formatShortDate(user.activeUntil)}</span>
  }
  if (user.activeUntil && user.activeUntil <= now) {
    return <span className="text-zinc-500">Berakhir {formatShortDate(user.activeUntil)}</span>
  }
  return <span className="text-zinc-400">Belum pernah</span>
}
