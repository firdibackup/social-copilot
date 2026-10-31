import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import type { SearchParams } from '@/lib/params'
import { CalendarView } from './calendar-view'

export async function generateMetadata() {
  const t = await getTranslations('calendar')
  return { title: t('page.title') }
}

interface KalenderPageProps {
  searchParams: Promise<SearchParams>
}

export default async function KalenderPage({ searchParams }: KalenderPageProps) {
  const t = await getTranslations('calendar')
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="calendar" label={t('page.loading')} />}>
        <CalendarView searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
