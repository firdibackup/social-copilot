import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { requireAccount } from '@/lib/auth'
import { loadEditorDetail, loadEditorSupport } from '@/lib/editor-data'
import { describeError } from '@/lib/errors'
import { firstValue, isUuid, type SearchParams } from '@/lib/params'
import { EditorWorkspace } from './editor-workspace'

export const metadata: Metadata = { title: 'Buat' }

export default function BuatPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <Suspense fallback={<LoadingState variant="editor" className="h-full" label="Memuat konten…" />}><Editor searchParams={searchParams} /></Suspense>
}

/** The opened draft and its support stream with the page, so the editor doesn't wait for hydration and two requests. */
async function Editor({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const scope = await requireAccount()
  const id = firstValue(params.id)
  const ide = firstValue(params.ide)
  const postId = isUuid(id) ? id : ''
  // A failure here only means the browser fetches it itself, as before.
  const [detail, support] = await Promise.all([loadEditorDetail(scope, params).catch(logAndNull), loadEditorSupport(scope).catch(logAndNull)])
  return <EditorWorkspace initial={{ id: postId, idea: !postId && isUuid(ide) ? ide : '', at: new Date().getTime(), detail, support }} />
}

function logAndNull(error: unknown): null {
  console.error('[buat] editor gagal dimuat:', describeError(error))
  return null
}
