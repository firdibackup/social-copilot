import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/landing-page'

export const metadata: Metadata = {
  title: 'Carousely — Ide jalan, konten tayang.',
  description: 'Dari ide pertama sampai konten tayang. Buat konten bersama AI Sigap, atur kalender, dan kelola balasan Instagram dalam satu workspace Carousely.',
  openGraph: {
    title: 'Carousely — Ide jalan, konten tayang.',
    description: 'Teman kerja untuk konten Instagram kamu. Bikin, jadwalkan, dan kelola dari satu tempat.',
    locale: 'id_ID',
    type: 'website',
  },
}

export default function Page() {
  return <LandingPage />
}
