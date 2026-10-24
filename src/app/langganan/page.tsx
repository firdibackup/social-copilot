import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { CarouselyLoader } from '@/components/brand-mark'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { currentOnboarded, currentPeriod, currentUser, requireUser } from '@/lib/auth'
import { getCheckoutContact, listPayments, paymentsEnabled, syncPendingPayments } from '@/lib/billing'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { describeError } from '@/lib/errors'
import { firstValue, type SearchParams } from '@/lib/params'
import { SubscribePage } from './subscribe-page'

export const metadata: Metadata = { title: 'Berlangganan' }

/** Old OAuth callbacks landed here; their results now belong to Pengaturan. */
const LEGACY_OAUTH = ['ig', 'fb', 'th', 'ig_error', 'fb_error', 'th_error']

/**
 * The plan picker, full screen and outside the (app) group, for a signed-in user without an active period. Once a
 * payment is confirmed the loader sends them on: to the onboarding wizard at /mulai, or back to Pengaturan.
 */
export default function LanggananPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<SubscribeLoading />}>
      <SubscribeLoader searchParams={searchParams} />
    </Suspense>
  )
}

function SubscribeLoading() {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-bg px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-lg space-y-10">
        <CarouselyLoader label="Menyiapkan pilihan paket…" />
        <LoadingState variant="form" label="Memuat paket…" />
      </div>
    </div>
  )
}

async function SubscribeLoader({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const userId = await requireUser()
  const params = await searchParams

  const legacy = new URLSearchParams()
  for (const key of LEGACY_OAUTH) {
    const value = firstValue(params[key])
    if (value) legacy.set(key, value)
  }
  if (legacy.size) redirect(`/pengaturan?${legacy}`)

  const returned = firstValue(params.bayar) === 'selesai'
  const orderId = firstValue(params.pesanan)

  let syncError = false
  await syncPendingPayments(userId).catch((error: unknown) => {
    console.error('[langganan] sinkron pembayaran gagal:', describeError(error))
    syncError = true
  })

  const [period, onboarded] = await Promise.all([currentPeriod(userId), currentOnboarded(userId)])
  if (period) {
    if (!onboarded) redirect('/mulai')
    if (returned) redirect(`/pengaturan?bayar=selesai${orderId ? `&pesanan=${encodeURIComponent(orderId)}` : ''}`)
    redirect('/pengaturan#paket')
  }

  let data
  try {
    const email = (await currentUser())?.email ?? ''
    const [billing, payments, contact] = await Promise.all([
      getBillingCatalog(), listPayments(userId),
      // A prefill only: the form still works empty.
      getCheckoutContact(userId, email).catch((error: unknown) => {
        console.error('[langganan] kontak checkout tidak terbaca:', describeError(error))
        return { name: '', whatsapp: '' }
      }),
    ])
    data = { billing, payments, contact }
  } catch (error) {
    console.error('[langganan] gagal memuat paket:', describeError(error))
    return (
      <main className="fixed inset-0 overflow-y-auto bg-bg px-5 py-16">
        <div className="mx-auto max-w-lg">
          <Notice tone="warning">Pilihan paket belum bisa dimuat. Muat ulang halaman untuk mencoba lagi.</Notice>
        </div>
      </main>
    )
  }

  const { billing, payments, contact } = data
  return (
    <SubscribePage
      catalog={billing.catalog}
      version={billing.version}
      enabled={paymentsEnabled()}
      contact={contact}
      payments={payments.map((payment) => ({
        ...payment,
        createdAt: payment.createdAt.toISOString(),
        periodStart: payment.periodStart?.toISOString() ?? null,
        periodEnd: payment.periodEnd?.toISOString() ?? null,
      }))}
      selectedPlan={firstValue(params.paket)}
      initialMonths={Number(firstValue(params.bulan))}
      returned={returned}
      orderId={orderId}
      syncError={syncError}
      hasPaidBefore={payments.some((payment) => payment.status === 'paid')}
    />
  )
}
