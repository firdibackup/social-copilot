'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { deleteDraftAction } from './content-actions'
import { useEditorScope } from './editor-provider'
import { removePostOptimistically } from './optimistic-events'

export function DeleteDraftButton({ id, onError }: { id: string; onError: (message: string) => void }) {
  const client = useQueryClient()
  const scope = useEditorScope()
  const lock = useRef(false)
  const [pending, setPending] = useState(false)

  async function remove() {
    if (lock.current || !window.confirm('Hapus konten ini? Draft akan dihapus permanen.')) return
    lock.current = true
    setPending(true)
    const restore = await removePostOptimistically(client, scope, id)
    const error = await deleteDraftAction(id).catch(() => 'Gagal menghubungi server. Coba lagi.')
    if (error) {
      restore()
      lock.current = false
      setPending(false)
      onError(error)
    }
    // The action's refresh() already re-renders the list and editor; no second round trip.
  }

  return (
    <button type="button" disabled={pending} aria-busy={pending} onClick={() => void remove()}
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60">
      <Trash2 size={14} aria-hidden="true" />
      {pending ? 'Menghapus…' : 'Hapus konten'}
    </button>
  )
}
