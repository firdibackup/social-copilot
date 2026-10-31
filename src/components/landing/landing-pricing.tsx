'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { ArrowUpRight, Check } from 'lucide-react'
import { DEFAULT_CATALOG, estimatedPosts as postsFor, quotePurchase, type BillingCatalog } from '@/lib/billing-catalog-options'
import { formatRupiah } from '@/lib/billing-options'
import { intlLocale } from '@/i18n/locale-config'
import styles from './pricing.module.css'

export function LandingPricing({ catalog, provisional = false }: { catalog: BillingCatalog; provisional?: boolean }) {
  const t = useTranslations('landing.pricing')
  const locale = useLocale()
  const [selected, setSelected] = useState(1)
  const months = catalog.durations.some((item) => item.months === selected) ? selected : catalog.durations[0].months
  const pro = catalog.plans.find((plan) => plan.id === 'pro')
  const plans = catalog.plans.filter((plan) => plan.active)
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
          const quote = quotePurchase(catalog, 0, plan.id, months)
          const multiplier = pro && plan.id !== pro.id && plan.credits > pro.credits ? plan.credits / pro.credits : null
          const estimatedPosts = postsFor(plan.credits)
          const postCount = estimatedPosts.toLocaleString(intlLocale(locale))
          // Custom catalog copy is admin-authored data; only localize known default descriptions.
          const defaultPlan = DEFAULT_CATALOG.plans.find((item) => item.id === plan.id && item.description === plan.description)
          const description = defaultPlan && (plan.id === 'pro' || plan.id === 'max') ? t(`descriptions.${plan.id}`) : plan.description
          const features = [
            t('features.posts', { count: estimatedPosts, formattedCount: postCount }),
            t('features.chatbot'),
            t('features.research'),
            t('features.creation'),
            t('features.calendar'),
            t('features.accounts'),
            t('features.analytics'),
            ...(plan.prioritySupport ? [t('features.support')] : []),
            ...(plan.earlyAccess ? [t('features.earlyAccess')] : []),
          ]
          return <article key={plan.id} className={`${styles.plan} ${plan.id === 'max' ? styles.max : ''}`}>
            <div className={styles.planTitle}><h3>{plan.name}</h3>{multiplier && Number.isInteger(multiplier) ? <span>{t('multiplier', { count: multiplier })}</span> : null}</div>
            <p className={styles.description}>{description}</p>
            {estimatedPosts > 0 && <p className={styles.estimate}><strong>{t('estimate', { count: postCount })}</strong><span>{t('review')}</span></p>}
            <div className={styles.price} aria-live="polite"><strong>{formatRupiah(Math.round(quote.total / months), locale)}</strong><span>{t('perMonth')}</span></div>
            <p className={styles.total}>{months === 1 ? t('monthly') : t('total', { amount: formatRupiah(quote.total, locale), count: months })}<br />{months === 1 ? t('noRenewal') : t('upfront')}</p>
            <Link href={`/langganan?paket=${encodeURIComponent(plan.id)}&bulan=${months}`} className={styles.choose}>{t('choose', { name: plan.name })}<ArrowUpRight size={18} aria-hidden="true" /></Link>
            <ul>{features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
          </article>
        })}
      </div>
      <p className={styles.note}>{t('paymentNote')}</p>
      <p className={styles.estimateNote}>{t('estimateNote')}</p>
      {provisional && <p className={styles.note}>{t('provisional')}</p>}
    </div>
  </section>
}
