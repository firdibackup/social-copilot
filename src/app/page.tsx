import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { LandingPage } from '@/components/landing/landing-page'
import { IntlMessages } from '@/i18n/client-messages'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { DEFAULT_CATALOG } from '@/lib/billing-catalog-options'
import { LandingPricing } from '@/components/landing/landing-pricing'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('landing.metadata'), getLocale()])
  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('title'),
      description: t('socialDescription'),
      locale: locale === 'id' ? 'id_ID' : 'en_US',
      type: 'website',
    },
  }
}

export default function Page() {
  return <IntlMessages namespaces={['common', 'landing']}><LandingPage pricing={<Suspense fallback={<LandingPricing catalog={DEFAULT_CATALOG} provisional />}><Pricing /></Suspense>} /></IntlMessages>
}

async function Pricing() {
  await connection()
  const billing = await getBillingCatalog().catch(() => null)
  return <LandingPricing catalog={billing?.catalog ?? DEFAULT_CATALOG} provisional={!billing} />
}
