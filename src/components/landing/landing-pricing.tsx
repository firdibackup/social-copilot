'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { ArrowUpRight, Check, Lock } from 'lucide-react'
import { FastIcon } from '@/components/fast-icon'
import { InstagramAiIcon } from '@/components/instagram-ai-icon'
import { defaultDescription, estimatedPosts as postsFor, planFeatures, quotaMultiple, quotePurchase, shownPlans, type BillingCatalog } from '@/lib/billing-catalog-options'
import { formatRupiah } from '@/lib/billing-options'
import { intlLocale } from '@/i18n/locale-config'
import styles from './pricing.module.css'

type Plan = BillingCatalog['plans'][number]

/** Lite is the plan on sale, so it sits in the middle (Pro | Lite | Max); every other plan keeps its order. */
function centerLite(plans: Plan[]) {
  const index = plans.findIndex((plan) => plan.id === 'lite')
  if (index < 0 || plans.length < 3) return plans
  const rest = plans.filter((_, i) => i !== index)
  return [rest[0], plans[index], ...rest.slice(1)]
}

export function LandingPricing({ catalog }: { catalog: BillingCatalog }) {
  const t = useTranslations('landing.pricing')
  const locale = useLocale()
  const [selected, setSelected] = useState(1)
  const months = catalog.durations.some((item) => item.months === selected) ? selected : catalog.durations[0].months
  const plans = centerLite(shownPlans(catalog))
  // The emphasized card: Lite (on sale, centered) when listed, otherwise Max as before.
  const leadId = plans.some((plan) => plan.id === 'lite') ? 'lite' : 'max'
  const discount = catalog.durations.find((item) => item.months === months)?.discount ?? 0
  return <section id="harga" className={styles.section} aria-labelledby="pricing-title">
    <div className={styles.inner}>
      <header className={styles.heading}>
        <h2 id="pricing-title">{t('title1')}<br />{t('title2')}</h2>
        <p>{t('subtitle1')}<br />{t('subtitle2')}</p>
      </header>
      <div className={styles.durations} role="group" aria-label={t('durationLabel')}>
        {catalog.durations.map((duration) => <button type="button" key={duration.months} aria-pressed={duration.months === months} onClick={() => setSelected(duration.months)}>
          {t('months', { count: duration.months })}{duration.discount > 0 && <span>{t('save', { percent: duration.discount })}</span>}
        </button>)}
      </div>
      {plans.length === 0 && <p className={styles.note}>{t('empty')}</p>}
      <div className={styles.grid}>
        {plans.map((plan) => {
          // A waitlist plan isn't on sale, so quotePurchase refuses it; its price shows with the same discount.
          const quote = plan.active ? quotePurchase(catalog, 0, plan.id, months) : { total: Math.round(plan.priceIdr * months * (100 - discount) / 100) }
          const multiplier = quotaMultiple(catalog, plan)
          const postCount = postsFor(plan.credits).toLocaleString(intlLocale(locale))
          // Custom catalog copy is admin-authored data; only localize known default descriptions.
          const standard = defaultDescription(plan)
          const description = standard ? t(`descriptions.${standard}`, { count: postCount }) : plan.description
          const features = planFeatures(plan).map((feature) => t(`features.${feature}`))
          const research = plan.researchDaily > 0
          const fast = plan.id === 'pro' || plan.id === 'max'
          return <article key={plan.id} className={`${styles.plan} ${plan.id === leadId ? styles.lead : ''}`}>
            <div className={styles.planTitle}><h3>{plan.name}</h3>{multiplier ? <span>{t('multiplier', { count: multiplier })}</span> : null}</div>
            <div className={styles.price} aria-live="polite"><strong>{formatRupiah(Math.round(quote.total / months), locale)}</strong><span>{t('perMonth')}</span></div>
            <p className={styles.total}>{months === 1 ? t('monthly') : t('upfront', { amount: formatRupiah(quote.total, locale), count: months })}</p>
            <p className={styles.description}>{description}</p>
            {plan.active
              ? <Link href={`/langganan?paket=${encodeURIComponent(plan.id)}&bulan=${months}`} className={styles.choose}>{t('choose', { name: plan.name })}<ArrowUpRight size={18} aria-hidden="true" /></Link>
              : <Link href="/langganan" className={`${styles.choose} ${styles.waitlist}`}><Lock size={16} aria-hidden="true" />{t('joinWaitlist')}</Link>}
            <ul>{features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
            {(research || fast) && <div className={styles.perks}>
              {research && <p className={`${styles.perk} ${styles.perkResearch}`}>
                <InstagramAiIcon width={22} height={22} className={styles.perkIcon} />
                <span><strong>{t('research')}</strong><small>{t('featured')}</small></span>
              </p>}
              {fast && <p className={`${styles.perk} ${styles.perkFast}`}>
                <FastIcon className={styles.perkIcon} />
                <span><strong>{t('fasterImages')}</strong><small>{t('featured')}</small></span>
              </p>}
            </div>}
          </article>
        })}
      </div>
      <p className={styles.note}>{t('provisional')}</p>
    </div>
  </section>
}
