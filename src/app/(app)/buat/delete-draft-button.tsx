'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { deleteDraftAction } from './content-actions'
import { editorKeys } from './editor-query'
import { useEditorScope } from './editor-provider'
import { setPostVisible } from './optimistic-events'

export function DeleteDraftButton({ id, onError }: { id: string; onError: (message: string) => void }) {
  const router = useRouter()
  const client = useQueryClient()
  const scope = useEditorScope()
  const lock = useRef(false)
  const [pending, setPending] = useState(false)

  async function remove() {
    if (lock.current || !window.confirm('Hapus konten ini? Draft akan dihapus permanen.')) return
    lock.current = true
    setPending(true)
    const key = editorKeys.detail(scope, id)
    await client.cancelQueries({ queryKey: key })
    const detail = client.getQueryData(key)
    const previousUrl = `${window.location.pathname}${window.location.search}`
    setPostVisible(id, false)
    window.history.replaceState(null, '', '/buat')
    client.removeQueries({ queryKey: key })
    const error = await deleteDraftAction(id).catch(() => 'Gagal menghubungi server. Coba lagi.')
    if (error) {
      setPostVisible(id, true)
      if (detail) client.setQueryData(key, detail)
      window.history.replaceState(null, '', previousUrl)
      lock.current = false
      setPending(false)
      onError(error)
      return
    }
    router.refresh()
  }

  return (
    <button type="button" disabled={pending} aria-busy={pending} onClick={() => void remove()}
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60">
      <Trash2 size={14} aria-hidden="true" />
      {pending ? 'Menghapus…' : 'Hapus konten'}
    </button>
  )
}
