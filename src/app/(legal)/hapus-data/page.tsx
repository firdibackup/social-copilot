import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LegalDocument } from '../legal-document'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal')
  return { title: t('deletion.title'), alternates: { canonical: '/hapus-data' } }
}

/** Penghapusan Data; the data deletion URL for the Meta app. Public (PUBLIC_PATHS in proxy.ts). */
export default function HapusDataPage() {
  return <LegalDocument doc="deletion" />
}
