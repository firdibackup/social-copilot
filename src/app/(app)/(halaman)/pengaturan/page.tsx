import { IntlMessages } from '@/i18n/client-messages'

import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import type { SearchParams } from '@/lib/params'
import { DensitySettings } from './density-settings'
import { InstagramSettings } from './instagram-settings'
import { ScheduleSettings } from './schedule-settings'
import { StorySettings } from './story-settings'
import { ThreadsSettings } from './threads-settings'
import Link from 'next/link'
import { currentOnboarded, requireUser } from '@/lib/auth'
import { getCurrentPeriod, syncPendingPayments } from '@/lib/billing'
import { describeError } from '@/lib/errors'
import { Notice } from '@/components/notice'
import { BillingSettings } from './billing-settings'
import { InactiveConnections } from './inactive-connections'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: t('page.settings') }
}

interface PengaturanPageProps {
  searchParams: Promise<SearchParams>
}

export default async function PengaturanPage({ searchParams }: PengaturanPageProps) {
  const t = await getTranslations('settings')

  return <IntlMessages namespaces={['common', 'settings']}><Suspense fallback={<LoadingState variant="settings" label={t('page.loadingSettings')} />}><Settings searchParams={searchParams} /></Suspense></IntlMessages>
}

async function Settings({ searchParams }: PengaturanPageProps) {
  const t = await getTranslations('settings')

  const userId = await requireUser()
  const params = await searchParams
  let syncError = false
  await syncPendingPayments(userId).catch((error: unknown) => {
    syncError = true
    console.error('[pengaturan] cek pembayaran:', describeError(error))
  })
  const [period, onboarded] = await Promise.all([getCurrentPeriod(userId), currentOnboarded(userId)])
  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{t('page.settings')}</h1>
        <p className="text-zinc-500">{t('page.plansCreditsAccountConnectionsAndAppPreferences')}</p>
      </header>
      <BillingSettings userId={userId} period={period} params={params} onboarded={onboarded} syncError={syncError} />
      {!period ? <>
        <Notice tone="warning">{t('page.yourSubscriptionIsnTActiveYetChoose')}</Notice>
        <InactiveConnections userId={userId} params={params} />
      </> : !onboarded ? <Notice tone="success">{t('page.yourPlanIsActive')} <Link href="/mulai" className="font-medium underline">{t('page.completeBrandSetup')}</Link>  {t('page.toStartUsingTheDashboard')}</Notice> : <>
      <Suspense
        fallback={<LoadingState variant="settings" label={t('page.loadingInstagramConnection')} className="rounded-xl border border-zinc-200 p-6" />}
      >
        <InstagramSettings searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<LoadingState variant="settings" label={t('page.loadingStory')} className="rounded-xl border border-zinc-200 p-6" />}>
        <StorySettings />
      </Suspense>
      <Suspense
        fallback={<LoadingState variant="settings" label={t('page.loadingThreadsConnection')} className="rounded-xl border border-zinc-200 p-6" />}
      >
        <ThreadsSettings searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<LoadingState variant="settings" label={t('page.loadingSchedule')} className="rounded-xl border border-zinc-200 p-6" />}>
        <ScheduleSettings />
      </Suspense>
      <Suspense fallback={<LoadingState variant="settings" label={t('page.loadingTextDensity')} className="rounded-xl border border-zinc-200 p-6" />}>
        <DensitySettings />
      </Suspense>
      </>}
    </div>
  )
}
