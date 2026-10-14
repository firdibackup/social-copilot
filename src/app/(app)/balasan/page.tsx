import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = { title: 'Balasan' }

export default function BalasanPage() {
  return <ComingSoon title="Balasan" description="Kotak masuk DM Instagram akan hadir di tahap berikutnya." />
}
