import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { CarouselyLogo } from '@/components/brand-mark'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { getPlan } from '@/lib/app-settings'
import { currentOnboarded, requireUser } from '@/lib/auth'
import {
  getCurrentPeriod,
  getUsage,
  listPayments,
  paymentsEnabled,
  syncPendingPayments,
  type PaymentStatus,
} from '@/lib/billing'
import { contentCost, formatRupiah } from '@/lib/billing-options'
import { getConnection, type Connection } from '@/lib/connection'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { hasFacebookConnection } from '@/lib/facebook-connection'
import { formatDateTime, formatShortDate } from '@/lib/format'
import { firstValue, type SearchParams } from '@/lib/params'
import { disconnectFacebook, disconnectInstagram } from '../(app)/(halaman)/pengaturan/actions'
import { signOut } from '../masuk/actions'
import { startCheckoutAction } from './actions'

export const metadata: Metadata = { title: 'Langganan' }

const CARD = 'space-y-4 rounded-xl border border-zinc-200 bg-white p-5'
const PRIMARY_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover'
const BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50'

const STATUS_LABELS: Record<PaymentStatus, string> = { paid: 'Lunas', pending: 'Menunggu', expired: 'Kedaluwarsa' }
const DISCONNECTED: Record<string, true> = { disconnected: true }
const DANGER_BUTTON =
  'rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50'

interface LanggananPageProps {
  searchParams: Promise<SearchParams>
}

/** Outside the (app) group: users without an active period land here, so it must not need one. */
export default function LanggananPage({ searchParams }: LanggananPageProps) {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/kalender" aria-label="Carousely, ke Kalender">
          <CarouselyLogo />
        </Link>
        <form action={signOut}>
          <button type="submit" className="text-sm text-zinc-600 hover:text-zinc-900">
            Keluar
          </button>
        </form>
      </header>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Langganan</h1>
      <Suspense fallback={<LoadingState variant="form" label="Memuat langganan…" />}>
        <Subscription searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

/** Without a period Pengaturan is out of reach, so the tokens can be taken out here. */
function Connections({ instagram, facebook }: { instagram: Connection | null; facebook: boolean }) {
  return (
    <section className={CARD}>
      <div className="space-y-1">
        <p className="font-medium text-zinc-900">Koneksi akun</p>
        <p className="text-sm text-zinc-600">
          Token akses tetap tersimpan terenkripsi selama langganan tidak aktif. Putuskan untuk menghapusnya sekarang.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {instagram && (
          <form action={disconnectInstagram}>
            <button type="submit" className={DANGER_BUTTON}>
              Putuskan Instagram @{instagram.username}
            </button>
          </form>
        )}
        {facebook && (
          <form action={disconnectFacebook}>
            <button type="submit" className={DANGER_BUTTON}>
              Putuskan Facebook
            </button>
          </form>
        )}
      </div>
    </section>
  )
}

async function Subscription({ searchParams }: LanggananPageProps) {
  const params = await searchParams
  const userId = await requireUser()
  // Back from Mayar's checkout, or a payment still open: ask Mayar before showing the state.
  await syncPendingPayments(userId).catch((error: unknown) =>
    console.error('[langganan] cek pembayaran gagal:', describeError(error)),
  )

  let data
  try {
    const period = await getCurrentPeriod(userId)
    const [usage, payments, instagram, facebook, plan] = await Promise.all([
      period ? getUsage(userId, period) : null,
      listPayments(userId),
      getConnection(userId),
      hasFacebookConnection(userId),
      getPlan(),
    ])
    data = { period, usage, payments, instagram, facebook, plan }
  } catch (error) {
    console.error('[langganan] gagal memuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  const { period, usage, payments, instagram, facebook, plan } = data
  const paying = paymentsEnabled()
  const justPaid = firstValue(params.bayar) === 'selesai'
  // First payment: the next steps are the onboarding wizard, then connecting Instagram.
  if (justPaid && period && !instagram) redirect((await currentOnboarded(userId)) ? '/pengaturan#instagram' : '/mulai')
  const waiting = payments.some((payment) => payment.status === 'pending')

  return (
    <div className="space-y-6">
      {!paying && (
        <Notice tone="warning">Mode uji coba: pembayaran belum aktif, jadi setiap periode {plan.days} hari gratis.</Notice>
      )}
      {firstValue(params.gagal) === 'bayar' && (
        <Notice tone="error">Halaman pembayaran gagal dibuat. Coba lagi sebentar lagi.</Notice>
      )}
      {DISCONNECTED[firstValue(params.ig) ?? ''] && <Notice tone="success">Koneksi Instagram sudah diputus.</Notice>}
      {DISCONNECTED[firstValue(params.fb) ?? ''] && <Notice tone="success">Koneksi Facebook sudah diputus.</Notice>}
      {(firstValue(params.ig_error) === 'gagal_putus' || firstValue(params.fb_error) === 'gagal_putus') && (
        <Notice tone="error">Koneksi gagal diputus. Coba lagi.</Notice>
      )}
      {justPaid && period && <Notice tone="success">Pembayaran diterima. Langganan aktif sampai {formatDateTime(period.activeUntil)}.</Notice>}
      {justPaid && !period && (
        <Notice tone="warning">
          Pembayaran belum terkonfirmasi. Kalau sudah membayar, tunggu sebentar lalu pilih Cek pembayaran.
        </Notice>
      )}

      {period && usage ? (
        <section className={CARD}>
          <div className="space-y-1">
            <p className="text-sm text-zinc-500">Status</p>
            <p className="font-medium text-zinc-900">Aktif sampai {formatDateTime(period.activeUntil)}</p>
            {period.activeUntil > period.end && (
              <p className="text-sm text-zinc-500">Periode berikutnya sudah dibayar dan mulai {formatShortDate(period.end)}.</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-700">Kuota AI periode ini</span>
              <span className="font-medium text-zinc-900">{usage.percent}% terpakai</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100" role="presentation">
              <div className="h-full rounded-full bg-primary" style={{ width: `${usage.percent}%` }} />
            </div>
            <p className="text-xs text-zinc-500">Kuota baru mulai {formatShortDate(period.end)}. Sisa kuota tidak terbawa.</p>
          </div>
          <form action={startCheckoutAction}>
            <button type="submit" className={PRIMARY_BUTTON}>
              Perpanjang {plan.days} hari · {paying ? formatRupiah(plan.priceIdr) : 'gratis'}
            </button>
          </form>
        </section>
      ) : (
        <section className={CARD}>
          <div className="space-y-1">
            <p className="font-medium text-zinc-900">{plan.name}</p>
            <p className="text-2xl font-semibold tracking-tight text-zinc-900">
              {formatRupiah(plan.priceIdr)} <span className="text-sm font-normal text-zinc-500">/ {plan.days} hari</span>
            </p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
            <li>1 akun Instagram Business atau Creator</li>
            <li>Jadwal post dan carousel, inbox DM dengan template balasan</li>
            <li>
              Kuota AI per periode: sekitar {Math.floor(plan.credits / contentCost(3))} konten 3 slide (caption dan
              gambarnya), atau {Math.floor(plan.credits / contentCost(1))} konten 1 gambar
            </li>
            <li>Prabayar, tanpa perpanjangan otomatis</li>
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <form action={startCheckoutAction}>
              <button type="submit" className={PRIMARY_BUTTON}>
                {!paying ? `Aktifkan ${plan.days} hari gratis` : waiting ? 'Lanjutkan pembayaran' : 'Bayar dengan Mayar'}
              </button>
            </form>
            {waiting && (
              <Link href="/langganan?bayar=selesai" className={BUTTON}>
                Cek pembayaran
              </Link>
            )}
          </div>
        </section>
      )}

      {!period && (instagram || facebook) && <Connections instagram={instagram} facebook={facebook} />}

      {payments.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">Riwayat pembayaran</h2>
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-zinc-700">{formatShortDate(payment.createdAt)}</span>
                <span className="text-zinc-900">{payment.amount === 0 ? 'Gratis' : formatRupiah(payment.amount)}</span>
                <span className="text-zinc-500">
                  {STATUS_LABELS[payment.status]}
                  {payment.periodStart && payment.periodEnd
                    ? ` · ${formatShortDate(payment.periodStart)}–${formatShortDate(payment.periodEnd)}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
