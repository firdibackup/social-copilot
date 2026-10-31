'use client'

import { useTranslations, useLocale } from 'next-intl'
import { intlLocale } from '@/i18n/locale-config'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ArrowRight, ArrowUpRight, Check, Clock, LogOut, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { CarouselyLogo } from '@/components/brand-mark'
import { CheckoutContactFields, useCheckoutContact } from '@/components/checkout-contact-fields'
import { InstagramAiIcon } from '@/components/instagram-ai-icon'
import { Notice } from '@/components/notice'
import type { Payment } from '@/lib/billing'
import { estimatedPosts, quotePurchase, type BillingCatalog, type CatalogPlan } from '@/lib/billing-catalog-options'
import { formatRupiah } from '@/lib/billing-options'
import { signOut } from '@/app/masuk/actions'
import { checkPaymentAction, checkoutAction, subscriptionActiveAction } from '@/app/(app)/(halaman)/pengaturan/billing-actions'
import { CouponField, isCouponError, useCoupon } from '@/app/(app)/(halaman)/pengaturan/billing-panel'

type ClientPayment = Omit<Payment, 'createdAt' | 'periodStart' | 'periodEnd'> & { createdAt: string; periodStart: string | null; periodEnd: string | null }
interface Props {
  catalog: BillingCatalog; version: number; enabled: boolean; payments: ClientPayment[]
  selectedPlan?: string; initialMonths: number; returned: boolean; orderId?: string; syncError: boolean; hasPaidBefore: boolean
  /** Prefill for the billing name and WhatsApp number. */
  contact: { name: string; whatsapp: string }
}

const PRIMARY = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_var(--color-primary)] transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none'
const SECONDARY = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-bg disabled:cursor-wait disabled:opacity-50'
const POLL_MS = 3000
/** About five minutes; after that the Cek Status button is the way. */
const POLL_ROUNDS = 100

export function SubscribePage(props: Props) {
  const t = useTranslations('billing.subscribe')
  const locale = useLocale()
  const money = (amount: number) => formatRupiah(amount, locale)
  const { catalog, enabled, payments } = props
  const router = useRouter()
  const plans = catalog.plans.filter((plan) => plan.active)
  const [planId, setPlanId] = useState(plans.find((plan) => plan.id === props.selectedPlan)?.id ?? plans[0]?.id ?? '')
  const [months, setMonths] = useState(catalog.durations.find((duration) => duration.months === props.initialMonths)?.months ?? catalog.durations[0]?.months ?? 1)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [paying, startPaying] = useTransition()
  const [checking, startChecking] = useTransition()
  const busy = paying || checking
  const contact = useCheckoutContact(props.contact, 'langganan')

  const selected = plans.find((plan) => plan.id === planId) ?? plans[0]
  const purchase = selected ? quotePurchase(catalog, props.version, selected.id, months, locale) : null
  const gross = purchase ? purchase.plan.priceIdr * months : 0
  const coupon = useCoupon('langganan', props.version, selected?.id, months)
  const applied = purchase ? coupon.applied : null
  // A 100% coupon activates right away, without Mayar, so it works even while payments are switched off.
  const free = applied?.total === 0
  const total = applied?.total ?? purchase?.total ?? 0
  const waiting = payments.find((payment) => payment.status === 'pending')
  const returnedPayment = props.orderId ? payments.find((payment) => payment.id === props.orderId) : undefined
  const expired = props.returned && returnedPayment?.status === 'expired'
  const fulfillmentError = payments.find((payment) => payment.fulfillmentError)
  const showStatus = props.returned || !!waiting
  const maxDiscount = Math.max(0, ...catalog.durations.map((duration) => duration.discount))

  // Back from Mayar before the payment is confirmed: watch the database (the webhook or worker confirms it, so this
  // costs no Mayar API call) and reload once a period is active; the server render then opens the dashboard.
  const polling = props.returned && !!waiting
  useEffect(() => {
    if (!polling) return
    let rounds = 0
    let stopped = false
    const timer = setInterval(async () => {
      if (++rounds > POLL_ROUNDS) return clearInterval(timer)
      if (document.visibilityState !== 'visible') return
      const { active } = await subscriptionActiveAction().catch(() => ({ active: false }))
      if (active && !stopped) { stopped = true; clearInterval(timer); router.refresh() }
    }, POLL_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [polling, router])

  function check() {
    setError(null)
    startChecking(async () => {
      try {
        const result = await checkPaymentAction()
        if (result.error) setError(result.error)
        else { setChecked(true); router.refresh() }
      } catch { setError(t('checkFailed')) }
    })
  }
  function pay() {
    if (!selected) return
    setError(null)
    const details = contact.validate()
    if (!details) return
    startPaying(async () => {
      try {
        const couponCode = applied?.code
        const result = await checkoutAction({ planId: selected.id, months, version: props.version, contact: details, ...(couponCode && { couponCode }) })
        if ('field' in result && result.field === 'contact') contact.showServerError(result.error)
        else if (result.error && couponCode && isCouponError(result.error)) coupon.reject(result.error)
        else if (result.error) setError(result.error)
        else if (result.link) window.location.assign(result.link)
      } catch { setError(t('paymentFailed')) }
    })
  }

  const ctaLabel = free && !waiting ? paying ? t('activating') : t('activateFree')
    : paying ? t('preparingPayment') : !enabled ? t('disabled') : waiting ? t('finishPending') : t('checkout')
  const ctaDisabled = busy || (!enabled && !free) || !selected || !!waiting || coupon.checking
  const ctaArrow = !paying && (enabled || free) && !waiting
  const askContact = (enabled || free) && !waiting && !!selected

  return (
    <div className="fixed inset-0 flex flex-col overflow-y-auto bg-bg">
      {/* Soft wash behind the heading: the one decorative touch, kept out of the reading path. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(60rem_22rem_at_15%_-10%,var(--color-lavender),transparent_70%),radial-gradient(40rem_18rem_at_95%_0%,color-mix(in_oklab,var(--color-mint)_70%,transparent),transparent_70%)]" />

      <header className="sticky top-0 z-20 border-b border-hairline bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-5">
          <CarouselyLogo />
          <form action={signOut}>
            <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink">
              <LogOut size={16} aria-hidden="true" />{t('logout')}
            </button>
          </form>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-5xl flex-1 animate-fade-in px-5 pt-10 pb-36 sm:pt-14 lg:pb-16">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper/80 px-3 py-1 text-xs font-medium text-ink-muted">
            <Sparkles size={14} className="text-primary" aria-hidden="true" />{props.hasPaidBefore ? t('reactivate') : t('oneMore')}
          </p>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-[-0.03em] text-ink text-balance sm:text-[2.6rem] sm:leading-[1.1]">
            {props.hasPaidBefore ? t('returningTitle') : t('title')}
          </h1>
          <p className="mt-3 text-base text-ink-muted text-pretty">
            {t('description')}
          </p>
        </div>

        <div className="mt-8 space-y-3" aria-live="polite">
          {error && <Notice tone="error">{error}</Notice>}
          {props.syncError && <Notice tone="warning">{t('syncError')}</Notice>}
          {fulfillmentError && <Notice tone="warning">{t('fulfillment', { id: fulfillmentError.id })}</Notice>}
          {!enabled && !free && <Notice tone="warning">{t('notEnabled')}</Notice>}
        </div>

        {showStatus && (
          <section aria-labelledby="status-heading" className="mt-6 overflow-hidden rounded-2xl border border-hairline bg-paper">
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex gap-4">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${expired && !waiting ? 'bg-amber-50 text-amber-700' : 'bg-accent-soft text-primary'}`}>
                  <Clock size={20} aria-hidden="true" className={checking ? 'animate-spin-slow' : ''} />
                </span>
                <div>
                  <h2 id="status-heading" className="font-semibold text-ink">
                    {waiting ? (props.returned ? t('awaiting') : t('unfinished')) : expired ? t('expired') : t('awaiting')}
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted text-pretty">
                    {waiting
                      ? props.returned
                        ? t('waitHint')
                        : t('pendingHint', { plan: waiting.planName ? t('pendingPlan', { name: waiting.planName }) : '', amount: money(waiting.amount) })
                      : expired
                        ? t('expiredHint')
                        : checked
                          ? t('checkedHint')
                          : t('uncheckedHint')}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                {waiting?.link && <a href={waiting.link} className={`${PRIMARY} min-h-11 px-4`}>{t('continuePayment')}<ArrowUpRight size={16} aria-hidden="true" /></a>}
                <button type="button" onClick={check} disabled={busy} className={SECONDARY}>
                  <RefreshCw size={16} aria-hidden="true" className={checking ? 'animate-spin' : ''} />{checking ? t('checking') : t('checkStatus')}
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="space-y-8">
            {plans.length ? (
              <fieldset disabled={busy}>
                <legend className="mb-3 text-sm font-semibold text-ink">{t('plan')}</legend>
                <div className={`grid gap-4 ${plans.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                  {plans.map((plan) => <PlanCard key={plan.id} plan={plan} checked={selected?.id === plan.id} onSelect={() => { setPlanId(plan.id); setError(null); coupon.reprice(plan.id, months) }} />)}
                </div>
              </fieldset>
            ) : <Notice tone="warning">{t('noPlans')}</Notice>}

            <fieldset disabled={busy}>
              <legend className="mb-3 flex w-full flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-ink">
                {t('duration')}
                {maxDiscount > 0 && <span className="text-xs font-medium text-mint-ink">{t('maxSavings', { discount: maxDiscount })}</span>}
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {catalog.durations.map((duration) => {
                  const active = months === duration.months
                  return (
                    <label key={duration.months} className={`relative flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-xl border px-3 py-2.5 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus ${active ? 'border-primary bg-primary/5 text-primary' : 'border-hairline bg-paper text-ink hover:border-zinc-300'}`}>
                      <input type="radio" name="durasi" value={duration.months} checked={active} onChange={() => { setMonths(duration.months); coupon.reprice(selected?.id, duration.months) }} className="sr-only" />
                      <span className="text-sm font-semibold">{t('months', { count: duration.months })}</span>
                      <span className={`mt-0.5 text-xs ${duration.discount > 0 ? 'font-medium text-mint-ink' : 'text-ink-muted'}`}>{duration.discount > 0 ? t('savings', { discount: duration.discount }) : t('regular')}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </div>

          <aside aria-labelledby="ringkasan-heading" className="rounded-2xl border border-hairline bg-paper p-5 sm:p-6 lg:sticky lg:top-20">
            <h2 id="ringkasan-heading" className="text-sm font-semibold text-ink">{t('summary')}</h2>
            {purchase ? (
              <>
                <p className="mt-3 font-display text-xl font-bold tracking-[-0.02em] text-ink">{purchase.plan.name} · {t('months', { count: months })}</p>
                <dl className="mt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-ink-muted">{money(purchase.plan.priceIdr)} × {t('months', { count: months })}</dt><dd className="tabular-nums text-ink">{money(gross)}</dd></div>
                  {purchase.discount > 0 && <div className="flex justify-between gap-4 text-mint-ink"><dt>{t('discount', { discount: purchase.discount })}</dt><dd className="tabular-nums">−{money(gross - purchase.total)}</dd></div>}
                  {applied && <div className="flex justify-between gap-4 text-mint-ink"><dt className="min-w-0 break-words">{t('coupon', { code: applied.code, percent: applied.percent })}</dt><dd className="tabular-nums">−{money(applied.couponDiscount)}</dd></div>}
                  <div className="flex items-baseline justify-between gap-4 border-t border-hairline pt-3"><dt className="font-semibold text-ink">{t('total')}</dt><dd className="font-display text-2xl font-bold tabular-nums tracking-[-0.02em] text-ink">{money(total)}</dd></div>
                </dl>
                {months > 1 && !free && <p className="mt-1 text-right text-xs text-ink-muted">{t('monthlyApprox', { amount: money(Math.round(total / months)) })}</p>}
                <CouponField coupon={coupon} disabled={busy || !!waiting} buttonClass={SECONDARY} inputClass="rounded-xl py-2.5 transition-colors" className="mt-5 border-t border-hairline pt-5" />
                <p className="mt-4 flex gap-2 text-xs text-ink-muted"><Check size={14} className="mt-px shrink-0 text-mint-ink" aria-hidden="true" />{t('activeTerm', { count: months })}</p>
              </>
            ) : <p className="mt-3 text-sm text-ink-muted">{t('selectPlan')}</p>}
            {askContact && <CheckoutContactFields contact={contact} disabled={busy} className="mt-5 border-t border-hairline pt-5" />}
            <button type="button" disabled={ctaDisabled} onClick={pay} className={`${PRIMARY} mt-5 hidden w-full lg:inline-flex`}>
              {ctaLabel}{ctaArrow && <ArrowRight size={16} aria-hidden="true" />}
            </button>
            <Footnote free={free} className="mt-4 hidden lg:flex" />
          </aside>
        </div>
      </main>

      {/* Mobile: the total and CTA stay within thumb reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-paper/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          {purchase && <div className="min-w-0 shrink-0"><p className="text-xs text-ink-muted">{t('total')}</p><p className="font-display text-lg font-bold tabular-nums tracking-[-0.02em] text-ink">{money(total)}</p></div>}
          <button type="button" disabled={ctaDisabled} onClick={pay} className={`${PRIMARY} flex-1`}>
            {ctaLabel}{ctaArrow && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </div>
        <Footnote free={free} className="mx-auto mt-2 flex max-w-5xl justify-center" />
      </div>
    </div>
  )
}

function Footnote({ free, className = '' }: { free: boolean; className?: string }) {
  const t = useTranslations('billing.subscribe')
  return (
    <p className={`items-center gap-1.5 text-[11px] leading-snug text-ink-muted ${className}`}>
      <ShieldCheck size={13} className="shrink-0" aria-hidden="true" />{free ? t('freeFootnote') : t('paidFootnote')}
    </p>
  )
}

function PlanCard({ plan, checked, onSelect }: { plan: CatalogPlan; checked: boolean; onSelect: () => void }) {
  const t = useTranslations('billing.subscribe')
  const locale = useLocale()
  const money = (amount: number) => formatRupiah(amount, locale)
  return (
    <label className={`group relative flex cursor-pointer flex-col rounded-2xl border bg-paper p-5 transition-[border-color,box-shadow] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus ${checked ? 'border-primary shadow-[0_0_0_1px_var(--color-primary),0_18px_40px_-24px_var(--color-primary)]' : 'border-hairline hover:border-zinc-300'}`}>
      <input type="radio" name="paket" value={plan.id} checked={checked} onChange={onSelect} className="sr-only" />
      <span className="flex items-start justify-between gap-3">
        <span className="font-display text-xl font-bold tracking-[-0.02em] text-ink">{plan.name}</span>
        <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors ${checked ? 'border-primary bg-primary text-white' : 'border-zinc-300 bg-paper text-transparent'}`}>
          <Check size={14} strokeWidth={3} />
        </span>
      </span>
      <span className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-[1.75rem] leading-none font-bold tabular-nums tracking-[-0.03em] text-ink">{money(plan.priceIdr)}</span>
        <span className="text-sm text-ink-muted">{t('perMonth')}</span>
      </span>
      {plan.description && <span className="mt-2 block text-sm text-ink-muted text-pretty">{plan.description === 'Untuk rutin membuat dan menjadwalkan konten.' ? t('proDescription') : plan.description === 'Lebih banyak ruang untuk produksi dan riset konten.' ? t('maxDescription') : plan.description}</span>}

      <span className="mt-5 block border-t border-hairline pt-4">
        <span className="flex items-center gap-2.5 text-sm text-ink">
          <Check size={16} className="shrink-0 text-mint-ink" aria-hidden="true" />
          <span><strong className="font-semibold tabular-nums">{t('posts', { count: estimatedPosts(plan.credits).toLocaleString(intlLocale(locale)) })}</strong> {t('perMonth')}</span>
        </span>
      </span>

      <span className="mt-3 flex items-center gap-3 rounded-xl bg-[linear-gradient(120deg,rgba(254,218,117,0.16),rgba(214,41,118,0.10)_55%,rgba(79,91,213,0.12))] px-3 py-2.5 ring-1 ring-[rgba(214,41,118,0.15)] ring-inset">
        <InstagramAiIcon width={22} height={22} className="shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{t('research')}</span>
          <span className="block bg-[linear-gradient(90deg,#FA7E1E,#D62976,#962FBF)] bg-clip-text text-[11px] font-semibold tracking-wide text-transparent uppercase">{t('featured')}</span>
        </span>
      </span>

      {(plan.prioritySupport || plan.earlyAccess) && (
        <span className="mt-3 block space-y-2 text-sm text-ink">
          {plan.prioritySupport && <span className="flex items-center gap-2.5"><Check size={16} className="shrink-0 text-mint-ink" aria-hidden="true" />{t('support')}</span>}
          {plan.earlyAccess && <span className="flex items-center gap-2.5"><Check size={16} className="shrink-0 text-mint-ink" aria-hidden="true" />{t('earlyAccess')}</span>}
        </span>
      )}
    </label>
  )
}
