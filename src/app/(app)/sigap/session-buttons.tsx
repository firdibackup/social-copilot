'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { deleteSessionAction } from './actions'

const FAILED = 'Gagal menghubungi server. Coba lagi.'

/** Deletes a conversation; the open one leaves the page for an empty chat. */
export function DeleteSessionButton({ id, title, active }: { id: string; title: string; active: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      aria-label={`Hapus percakapan ${title}`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Hapus percakapan "${title}"? Skrip yang sudah tersimpan di Buat tetap ada.`)) return
        startTransition(async () => {
          const error = await deleteSessionAction(id).catch(() => FAILED)
          if (error) window.alert(error)
          else if (active) router.replace('/sigap')
        })
      }}
      className="absolute top-1/2 right-0 -translate-y-1/2 rounded-md p-1.5 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-100 hover:text-ink focus-visible:opacity-100 disabled:opacity-40 max-md:opacity-100"
    >
      <Trash2 size={14} aria-hidden="true" />
    </button>
  )
}
