import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/landing-page'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { DEFAULT_CATALOG } from '@/lib/billing-catalog-options'
import { LandingPricing } from '@/components/landing/landing-pricing'

export const metadata: Metadata = {
  title: 'Carousely — Ide jalan, konten tayang.',
  description: 'Dari ide pertama sampai konten tayang. Buat konten bersama AI Mimo, atur kalender, dan kelola balasan Instagram dalam satu workspace Carousely.',
  openGraph: {
    title: 'Carousely — Ide jalan, konten tayang.',
    description: 'Teman kerja untuk konten Instagram kamu. Bikin, jadwalkan, dan kelola dari satu tempat.',
    locale: 'id_ID',
    type: 'website',
  },
}

export default function Page() {
  return <LandingPage pricing={<Suspense fallback={<LandingPricing catalog={DEFAULT_CATALOG} provisional />}><Pricing /></Suspense>} />
}

async function Pricing() {
  await connection()
  const billing = await getBillingCatalog().catch(() => null)
  return <LandingPricing catalog={billing?.catalog ?? DEFAULT_CATALOG} provisional={!billing} />
}
