import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LegalDocument } from '../legal-document'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal')
  return { title: t('refund.title'), alternates: { canonical: '/refund' } }
}

/** Kebijakan Refund. Public (PUBLIC_PATHS in proxy.ts). */
export default function RefundPage() {
  return <LegalDocument doc="refund" />
}
