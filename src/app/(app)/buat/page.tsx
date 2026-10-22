import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { EditorWorkspace } from './editor-workspace'

export const metadata: Metadata = { title: 'Buat' }

/** Navigation is a small shell. Detail data lives in the account-scoped browser cache. */
export default function BuatPage() {
  return <Suspense fallback={<LoadingState variant="editor" className="h-full" label="Memuat konten…" />}><EditorWorkspace /></Suspense>
}
