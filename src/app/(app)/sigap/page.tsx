import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { SigapWorkspace } from './sigap-workspace'

export const metadata: Metadata = { title: 'Sigap' }

/** A small navigation shell; conversations use the account-scoped browser cache. */
export default function SigapPage() {
  return <Suspense fallback={<LoadingState variant="chat" className="h-full" label="Memuat Sigap…" />}><SigapWorkspace /></Suspense>
}
