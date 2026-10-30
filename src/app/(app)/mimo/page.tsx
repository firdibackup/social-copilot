import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { MimoWorkspace } from './mimo-workspace'

export const metadata: Metadata = { title: 'Mimo Chat' }

/** A small navigation shell; conversations use the account-scoped browser cache. */
export default function MimoPage() {
  return <Suspense fallback={<LoadingState variant="chat" className="h-full" label="Memuat Mimo…" />}><MimoWorkspace /></Suspense>
}
