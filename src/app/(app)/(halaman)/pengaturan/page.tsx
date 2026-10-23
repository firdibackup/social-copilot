import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import type { SearchParams } from '@/lib/params'
import { DensitySettings } from './density-settings'
import { FacebookSettings } from './facebook-settings'
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

export const metadata: Metadata = { title: 'Pengaturan' }

interface PengaturanPageProps {
  searchParams: Promise<SearchParams>
}

export default function PengaturanPage({ searchParams }: PengaturanPageProps) {
  return <Suspense fallback={<LoadingState variant="settings" label="Memuat pengaturan…" />}><Settings searchParams={searchParams} /></Suspense>
}

async function Settings({ searchParams }: PengaturanPageProps) {
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
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Pengaturan</h1>
        <p className="text-zinc-500">Paket, kredit, koneksi akun, dan preferensi aplikasi.</p>
      </header>
      <BillingSettings userId={userId} period={period} params={params} onboarded={onboarded} syncError={syncError} />
      {!period ? <>
        <Notice tone="warning">Langganan belum aktif. Pilih paket untuk menggunakan fitur dashboard. Koneksi akun yang tersimpan tetap bisa diputus di bawah.</Notice>
        <InactiveConnections userId={userId} params={params} />
      </> : !onboarded ? <Notice tone="success">Paket sudah aktif. <Link href="/mulai" className="font-medium underline">Lengkapi pengaturan brand</Link> untuk mulai menggunakan dashboard.</Notice> : <>
      <Suspense
        fallback={<LoadingState variant="settings" label="Memuat koneksi Instagram…" className="rounded-xl border border-zinc-200 p-6" />}
      >
        <InstagramSettings searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<LoadingState variant="settings" label="Memuat Story…" className="rounded-xl border border-zinc-200 p-6" />}>
        <StorySettings />
      </Suspense>
      <Suspense
        fallback={<LoadingState variant="settings" label="Memuat koneksi Threads…" className="rounded-xl border border-zinc-200 p-6" />}
      >
        <ThreadsSettings searchParams={searchParams} />
      </Suspense>
      <Suspense
        fallback={<LoadingState variant="settings" label="Memuat koneksi Facebook…" className="rounded-xl border border-zinc-200 p-6" />}
      >
        <FacebookSettings searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<LoadingState variant="settings" label="Memuat jadwal…" className="rounded-xl border border-zinc-200 p-6" />}>
        <ScheduleSettings />
      </Suspense>
      <Suspense fallback={<LoadingState variant="settings" label="Memuat kepadatan teks…" className="rounded-xl border border-zinc-200 p-6" />}>
        <DensitySettings />
      </Suspense>
      </>}
    </div>
  )
}
