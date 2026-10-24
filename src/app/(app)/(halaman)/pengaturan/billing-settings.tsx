import { getBillingCatalog } from '@/lib/billing-catalog'
import { currentUser } from '@/lib/auth'
import { getCheckoutContact, getUsage, listPayments, paymentsEnabled, type Period } from '@/lib/billing'
import { describeError } from '@/lib/errors'
import { firstValue, type SearchParams } from '@/lib/params'
import { Notice } from '@/components/notice'
import { BillingPanel } from './billing-panel'

export async function BillingSettings({ userId, period, params, onboarded, syncError }: {
  userId: string; period: Period | null; params: SearchParams; onboarded: boolean; syncError: boolean
}) {
  let data
  try {
    const email = (await currentUser())?.email ?? ''
    const [billing, usage, payments, contact] = await Promise.all([
      getBillingCatalog(), period ? getUsage(userId, period) : null, listPayments(userId),
      // A prefill only: the form still works empty.
      getCheckoutContact(userId, email).catch((error: unknown) => {
        console.error('[pengaturan] kontak checkout tidak terbaca:', describeError(error))
        return { name: '', whatsapp: '' }
      }),
    ])
    data = { billing, usage, payments, contact }
  } catch (error) {
    console.error('[pengaturan] billing gagal dimuat:', describeError(error))
    return <section id="paket"><h2 className="mb-3 text-lg font-semibold">Paket & Kredit</h2>
      <Notice tone="warning">Detail paket belum bisa dimuat. Muat ulang halaman untuk mencoba lagi.</Notice></section>
  }
  const { billing, usage, payments, contact } = data
  return <BillingPanel {...billing} enabled={paymentsEnabled()} usage={usage} contact={contact}
      period={period ? { plan: period.plan ?? null, start: period.start.toISOString(), end: period.end.toISOString(), activeUntil: period.activeUntil.toISOString() } : null}
      payments={payments.map((payment) => ({ ...payment, createdAt: payment.createdAt.toISOString(),
        periodStart: payment.periodStart?.toISOString() ?? null, periodEnd: payment.periodEnd?.toISOString() ?? null }))}
      initialIntent={firstValue(params.billing)} selectedPlan={firstValue(params.paket)} initialMonths={Number(firstValue(params.bulan))}
      returned={firstValue(params.bayar) === 'selesai'} orderId={firstValue(params.pesanan)} onboarded={onboarded} syncError={syncError} />
}
