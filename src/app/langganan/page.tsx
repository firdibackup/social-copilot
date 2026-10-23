import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { firstValue, type SearchParams } from '@/lib/params'

/** Compatibility for bookmarks, old checkout returns, and pricing links. */
export default function LanggananPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <Suspense fallback={null}><LegacyRedirect searchParams={searchParams} /></Suspense>
}

async function LegacyRedirect({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const next = new URLSearchParams({ billing: 'pilih' })
  for (const key of ['paket', 'bulan', 'bayar', 'pesanan', 'gagal', 'ig', 'fb', 'th', 'ig_error', 'fb_error', 'th_error']) {
    const value = firstValue(params[key])
    if (value) next.set(key, value)
  }
  return redirect(`/pengaturan?${next}`)
}
