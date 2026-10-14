import type { Metadata } from 'next'
import { Suspense } from 'react'
import type { SearchParams } from '@/lib/params'
import { CalendarView } from './calendar-view'

export const metadata: Metadata = { title: 'Kalender' }

interface KalenderPageProps {
  searchParams: Promise<SearchParams>
}

export default function KalenderPage({ searchParams }: KalenderPageProps) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<p className="text-sm text-zinc-500">Memuat kalender…</p>}>
        <CalendarView searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
