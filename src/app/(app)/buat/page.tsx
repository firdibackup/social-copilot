import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = { title: 'Buat' }

export default function BuatPage() {
  return <ComingSoon title="Buat" description="Pembuat caption dan gambar dengan AI akan hadir di tahap berikutnya." />
}
