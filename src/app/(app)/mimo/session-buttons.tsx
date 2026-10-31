'use client'

import { Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTransition } from 'react'
import { alertDialog, confirmDialog } from '@/components/confirm-dialog'
import { deleteSessionAction } from './actions'
import { useMimoScope } from './mimo-provider'
import { forgetConversation, restoreConversation } from './mimo-query'

const FAILED = 'Gagal menghubungi server. Coba lagi.'

/** Deletes a conversation; the open one leaves the page for an empty chat. */
export function DeleteSessionButton({ id, title, active }: { id: string; title: string; active: boolean }) {
  const client = useQueryClient()
  const { scope, isCurrent } = useMimoScope()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      aria-label={`Hapus percakapan ${title}`}
      disabled={pending}
      onClick={async () => {
        if (!(await confirmDialog({
          title: `Hapus percakapan "${title}"?`,
          description: 'Skrip yang sudah tersimpan di Buat tetap ada.',
          confirmLabel: 'Hapus',
          tone: 'danger',
        }))) return
        startTransition(async () => {
          const previousUrl = `${window.location.pathname}${window.location.search}`
          const wasOpen = active && new URLSearchParams(window.location.search).get('sesi') === id
          const snapshot = await forgetConversation(client, scope, id)
          if (wasOpen) window.history.replaceState(null, '', '/mimo')
          const error = await deleteSessionAction(id).catch(() => FAILED)
          if (error) {
            if (isCurrent()) restoreConversation(client, scope, id, snapshot)
            if (wasOpen && window.location.pathname === '/mimo' && !window.location.search) window.history.replaceState(null, '', previousUrl)
            await alertDialog({ title: 'Percakapan tidak dapat dihapus', description: error, tone: 'danger' })
          }
        })
      }}
      className="absolute top-1/2 right-0 -translate-y-1/2 rounded-md p-1.5 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-100 hover:text-ink focus-visible:opacity-100 disabled:opacity-40 max-md:opacity-100"
    >
      <Trash2 size={14} aria-hidden="true" />
    </button>
  )
}
