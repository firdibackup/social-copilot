import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LegalDocument } from '../legal-document'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal')
  return { title: t('privacy.title'), alternates: { canonical: '/privasi' } }
}

/** Kebijakan Privasi; anchors #ketentuan and #hapus-data are linked from the Meta app settings. Public (PUBLIC_PATHS in proxy.ts). */
export default function PrivasiPage() {
  return <LegalDocument doc="privacy" />
}
