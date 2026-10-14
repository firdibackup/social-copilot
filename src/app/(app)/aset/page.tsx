import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = { title: 'Aset' }

export default function AsetPage() {
  return <ComingSoon title="Aset" description="Pustaka gambar dan video akan hadir bersama tahap Kalender." />
}
