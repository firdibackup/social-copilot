import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = { title: 'Kalender' }

export default function KalenderPage() {
  return (
    <ComingSoon
      title="Kalender"
      description="Jadwal posting akan tampil di sini setelah tahap Kalender selesai dibangun."
    />
  )
}
