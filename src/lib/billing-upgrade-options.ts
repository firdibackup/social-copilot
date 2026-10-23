import { addBillingMonths, type CatalogPlan, type PurchaseSnapshot } from './billing-catalog-options'

export interface PaidTerm {
  id: string
  period_start: string
  period_end: string
  snapshot: (Partial<PurchaseSnapshot> & { plan: CatalogPlan; monthly?: boolean }) | null
  entitlement_plan: CatalogPlan | null
}

export interface UpgradeSnapshot {
  kind: 'upgrade'
  version: number
  plan: CatalogPlan
  total: number
  quotedAt: string
  activeUntil: string
  additionalCredits: number
  terms: { id: string; start: string; end: string; from: CatalogPlan; amount: number }[]
}

/** Charge only the remaining fractions of anchored billing months, retaining the purchased discount. */
export function quoteUpgrade(terms: PaidTerm[], target: CatalogPlan, version: number, now = new Date()): UpgradeSnapshot {
  const current = terms.find((term) => new Date(term.period_start) <= now && new Date(term.period_end) > now)
  if (!current) throw new Error('Langganan sudah berakhir. Pilih paket untuk mengaktifkan kembali.')
  const from = current.entitlement_plan ?? current.snapshot?.plan
  if (!from || !canUpgrade(from, target)) throw new Error('Paket ini bukan upgrade dari paket aktif.')
  const remaining = terms.filter((term) => new Date(term.period_end) > now)
  const lines = remaining.map((term) => {
    const old = term.entitlement_plan ?? term.snapshot?.plan
    if (!old || !canUpgrade(old, target)) throw new Error('Ada paket mendatang yang tidak dapat dinaikkan ke paket ini.')
    const start = new Date(term.period_start)
    const end = new Date(term.period_end)
    let months = 0
    // Paid terms are bounded by the catalog; legacy monthly grants may span many years.
    if (term.snapshot?.months || term.snapshot?.monthly) {
      for (let index = 0; index < 2400; index++) {
        const a = addBillingMonths(start, index)
        if (a >= end) break
        const next = addBillingMonths(start, index + 1)
        const b = new Date(Math.min(next.getTime(), end.getTime()))
        months += Math.max(0, b.getTime() - Math.max(a.getTime(), now.getTime())) / (next.getTime() - a.getTime())
        if (index === 2399) throw new Error('Masa aktif terlalu panjang. Hubungi tim untuk upgrade.')
      }
    } else {
      months = Math.max(0, end.getTime() - Math.max(start.getTime(), now.getTime())) / (30 * 86400000)
    }
    const discount = term.snapshot?.discount ?? 0
    return { id: term.id, start: term.period_start, end: term.period_end, from: old,
      amount: Math.round((target.priceIdr - old.priceIdr) * (100 - discount) / 100 * months) }
  })
  const total = lines.reduce((sum, line) => sum + line.amount, 0)
  if (total < 1000) throw new Error('Sisa biaya upgrade di bawah Rp 1.000. Perpanjang dulu atau tunggu periode berikutnya.')
  if (total > 100_000_000) throw new Error('Hubungi tim untuk upgrade masa aktif ini.')
  return { kind: 'upgrade', version, plan: { ...target }, total, quotedAt: now.toISOString(),
    activeUntil: new Date(Math.max(...remaining.map((term) => new Date(term.period_end).getTime()))).toISOString(),
    additionalCredits: target.credits - from.credits, terms: lines }
}

export function canUpgrade(from: CatalogPlan, to: CatalogPlan): boolean {
  return to.active && to.id !== from.id && to.priceIdr > from.priceIdr && to.credits >= from.credits
    && to.chatDaily >= from.chatDaily && to.researchDaily >= from.researchDaily
    && (!from.prioritySupport || to.prioritySupport) && (!from.earlyAccess || to.earlyAccess)
}
