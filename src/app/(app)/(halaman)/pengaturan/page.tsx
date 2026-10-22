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

export const metadata: Metadata = { title: 'Pengaturan' }

interface PengaturanPageProps {
  searchParams: Promise<SearchParams>
}

export default function PengaturanPage({ searchParams }: PengaturanPageProps) {
  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Pengaturan</h1>
        <p className="text-zinc-500">Koneksi akun dan preferensi aplikasi.</p>
      </header>
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
    </div>
  )
}
