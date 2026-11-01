import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { LandingPage } from '@/components/landing/landing-page'
import { IntlMessages } from '@/i18n/client-messages'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { DEFAULT_CATALOG } from '@/lib/billing-catalog-options'
import { LandingPricing } from '@/components/landing/landing-pricing'
import { siteUrl } from '@/lib/site'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('landing.metadata'), getLocale()])
  const image = { url: '/og-image.jpg', width: 1200, height: 630, alt: t('ogAlt') }
  return {
    title: { absolute: t('title') },
    description: t('description'),
    alternates: { canonical: '/' },
    openGraph: {
      title: t('title'),
      description: t('socialDescription'),
      url: '/',
      siteName: 'Carousely',
      locale: locale === 'id' ? 'id_ID' : 'en_US',
      type: 'website',
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: t('title'), description: t('socialDescription'), images: [image.url] },
  }
}

/** Structured data mirroring what the page shows: the product, its free trial, and the visible FAQ. */
async function StructuredData() {
  const t = await getTranslations('landing')
  const base = siteUrl().origin
  const faq = ['audience', 'account', 'ai', 'start', 'demo'] as const
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${base}/#org`, name: 'Carousely', url: `${base}/`, logo: `${base}/brand/carousely-mark.webp` },
      { '@type': 'WebSite', '@id': `${base}/#website`, name: 'Carousely', url: `${base}/`, publisher: { '@id': `${base}/#org` }, inLanguage: 'id-ID' },
      {
        '@type': 'SoftwareApplication', name: 'Carousely', url: `${base}/`, image: `${base}/og-image.jpg`,
        applicationCategory: 'BusinessApplication', operatingSystem: 'Web', description: t('metadata.description'),
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'IDR', description: t('trial.note') },
        publisher: { '@id': `${base}/#org` },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map(key => ({ '@type': 'Question', name: t(`faq.${key}Question`), acceptedAnswer: { '@type': 'Answer', text: t(`faq.${key}Answer`) } })),
      },
    ],
  }
  // JSON.stringify can't emit "</script>", but escape "<" anyway so translated copy can never break out of the tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />
}

export default function Page() {
  return <><Suspense fallback={null}><StructuredData /></Suspense><IntlMessages namespaces={['common', 'landing']}><LandingPage pricing={<Suspense fallback={<LandingPricing catalog={DEFAULT_CATALOG} provisional />}><Pricing /></Suspense>} /></IntlMessages></>
}

async function Pricing() {
  await connection()
  const billing = await getBillingCatalog().catch(() => null)
  return <LandingPricing catalog={billing?.catalog ?? DEFAULT_CATALOG} provisional={!billing} />
}
