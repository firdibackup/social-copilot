import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LegalDocument } from '../legal-document'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal')
  return { title: t('terms.title'), alternates: { canonical: '/syarat' } }
}

/** Syarat & Ketentuan. Public (PUBLIC_PATHS in proxy.ts). */
export default function SyaratPage() {
  return <LegalDocument doc="terms" />
}
