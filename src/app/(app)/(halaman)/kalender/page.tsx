import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import type { SearchParams } from '@/lib/params'
import { CalendarView } from './calendar-view'

export const metadata: Metadata = { title: 'Kalender' }

interface KalenderPageProps {
  searchParams: Promise<SearchParams>
}

export default function KalenderPage({ searchParams }: KalenderPageProps) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="calendar" label="Memuat kalender…" />}>
        <CalendarView searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
