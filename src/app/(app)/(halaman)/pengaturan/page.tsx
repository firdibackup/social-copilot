import type { Metadata } from 'next'
import { Suspense } from 'react'
import type { SearchParams } from '@/lib/params'
import { FacebookSettings } from './facebook-settings'
import { InstagramSettings } from './instagram-settings'

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
        fallback={<p className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500">Memuat koneksi Instagram…</p>}
      >
        <InstagramSettings searchParams={searchParams} />
      </Suspense>
      <Suspense
        fallback={<p className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500">Memuat koneksi Facebook…</p>}
      >
        <FacebookSettings searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
