import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { FOLLOWUP_DAYS, listUnfinishedPayments } from '@/lib/admin'
import { formatCredits } from '@/lib/admin-options'
import { requireAdmin } from '@/lib/auth'
import { formatRupiah } from '@/lib/billing-options'
import { appUrl } from '@/lib/env'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { formatDateTime, formatShortDateTime } from '@/lib/format'
import { firstValue, type SearchParams } from '@/lib/params'
import { reminderMessage, type UnfinishedPayment } from '@/lib/payment-followup-options'
import { formatWhatsapp, whatsappLink } from '@/lib/whatsapp'
import { TABLE, TD, TH } from '../ui'
import { ReminderActions } from './reminder-actions'

export const metadata: Metadata = { title: 'Pembayaran · Admin' }

interface PembayaranPageProps {
  searchParams: Promise<SearchParams>
}

const FILTERS = [
  { value: 'semua', label: 'Semua' },
  { value: 'pending', label: 'Menunggu' },
  { value: 'expired', label: 'Kedaluwarsa' },
] as const
type Filter = (typeof FILTERS)[number]['value']

export default function PembayaranPage({ searchParams }: PembayaranPageProps) {
  return (
    <Suspense fallback={<LoadingState variant="table" label="Memuat pembayaran…" />}>
      <Payments searchParams={searchParams} />
    </Suspense>
  )
}

async function Payments({ searchParams }: PembayaranPageProps) {
  await connection()
  await requireAdmin()
  const params = await searchParams
  const requested = firstValue(params.status)
  const filter: Filter = FILTERS.some((item) => item.value === requested) ? (requested as Filter) : 'semua'

  let payments: UnfinishedPayment[]
  try {
    payments = await listUnfinishedPayments()
  } catch (error) {
    console.error('[admin] pembayaran tertunda gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  const pending = payments.filter((payment) => payment.status === 'pending')
  const expired = payments.filter((payment) => payment.status === 'expired')
  const notReminded = payments.filter((payment) => payment.reminderCount === 0).length
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const counts: Record<Filter, number> = { semua: payments.length, pending: pending.length, expired: expired.length }
  const rows = filter === 'pending' ? pending : filter === 'expired' ? expired : payments
  const subscribeUrl = appUrl('/langganan')

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Menunggu pembayaran" value={formatCredits(pending.length)} />
        <Stat label="Kedaluwarsa" value={formatCredits(expired.length)} />
        <Stat label="Belum diingatkan" value={formatCredits(notReminded)} tone={notReminded > 0 ? 'warning' : 'normal'} />
        <Stat label="Total nilai tertunda" value={formatRupiah(total)} />
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Saring status" className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
          {FILTERS.map((item) => {
            const active = item.value === filter
            return (
              <Link
                key={item.value}
                href={item.value === 'semua' ? '/admin/pembayaran' : `/admin/pembayaran?status=${item.value}`}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-900'}`}
              >
                {item.label}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-zinc-100 text-zinc-700' : 'text-zinc-400'}`}>{counts[item.value]}</span>
              </Link>
            )
          })}
        </nav>
        <p className="text-xs text-zinc-500">Checkout terakhir tiap pengguna yang belum dibayar, {FOLLOWUP_DAYS} hari terakhir.</p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
          {payments.length === 0 || filter === 'semua'
            ? `Tidak ada pembayaran tertunda dalam ${FOLLOWUP_DAYS} hari terakhir.`
            : filter === 'pending'
              ? 'Tidak ada pembayaran yang masih menunggu.'
              : 'Tidak ada pembayaran yang kedaluwarsa.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className={TABLE}>
            <thead className="border-b border-zinc-100">
              <tr>
                <th className={TH}>Pengguna</th>
                <th className={TH}>WhatsApp</th>
                <th className={TH}>Pesanan</th>
                <th className={TH}>Status</th>
                <th className={TH}>Dibuat</th>
                <th className={TH}>Pengingat</th>
                <th className={TH}>
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((payment) => (
                <tr key={payment.paymentId} className="hover:bg-zinc-50">
                  <td className={`${TD} min-w-48`}>
                    <Link href={`/admin/pengguna?id=${payment.userId}`} className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                      {payment.name || payment.email || '(tanpa nama)'}
                    </Link>
                    {payment.name && payment.email && <p className="text-xs break-all text-zinc-500">{payment.email}</p>}
                  </td>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>
                    {payment.whatsapp ? <span className="text-zinc-700">{formatWhatsapp(payment.whatsapp)}</span> : <span className="text-zinc-400">–</span>}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <p className="text-zinc-900">
                      {payment.planName ?? 'Carousely'}
                      <span className="text-zinc-500"> · {payment.kind === 'upgrade' ? 'Upgrade' : payment.months ? `${payment.months} bulan` : 'Langganan'}</span>
                      {payment.couponCode && (
                        <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700">Kupon {payment.couponCode}</span>
                      )}
                    </p>
                    <p className="font-medium tabular-nums text-zinc-900">{formatRupiah(payment.amount)}</p>
                  </td>
                  <td className={TD}>
                    {payment.status === 'pending' ? (
                      <>
                        <Badge tone="pending">Menunggu pembayaran</Badge>
                        {payment.expiresAt && <p className="mt-1 text-xs whitespace-nowrap text-zinc-500">berlaku s.d. {formatShortDateTime(payment.expiresAt)}</p>}
                      </>
                    ) : (
                      <Badge tone="expired">Kedaluwarsa</Badge>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <time dateTime={payment.createdAt.toISOString()} title={formatDateTime(payment.createdAt)} className="text-zinc-700">
                      {formatShortDateTime(payment.createdAt)}
                    </time>
                    {payment.attempts > 1 && <p className="mt-1 text-xs text-amber-700">{payment.attempts}× mencoba</p>}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {payment.reminderCount === 0 ? (
                      <span className="text-zinc-400">Belum</span>
                    ) : (
                      <span className="text-zinc-700">
                        {payment.reminderCount}×
                        {payment.remindedAt && <span className="text-zinc-500"> · terakhir {formatShortDateTime(payment.remindedAt)}</span>}
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    <ReminderActions
                      paymentId={payment.paymentId}
                      chatHref={payment.whatsapp ? whatsappLink(payment.whatsapp, reminderMessage(payment, subscribeUrl)) : null}
                      payLink={payment.status === 'pending' ? payment.link : null}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warning' }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${tone === 'warning' ? 'text-amber-700' : 'text-zinc-900'}`}>{value}</dd>
    </div>
  )
}

function Badge({ tone, children }: { tone: 'pending' | 'expired'; children: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tone === 'pending' ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-zinc-100 text-zinc-600'}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${tone === 'pending' ? 'bg-amber-500' : 'bg-zinc-400'}`} />
      {children}
    </span>
  )
}
