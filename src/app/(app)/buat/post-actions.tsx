'use client'

import type { FormEvent } from 'react'
import type { PostStatus } from '@/lib/post-status'
import { cancelPostAction, deletePostAction, duplicatePostAction, retryPostAction } from './actions'

interface ActionFormProps {
  action: (formData: FormData) => Promise<void>
  id: string
  label: string
  confirmMessage?: string
  danger?: boolean
}

function ActionForm({ action, id, label, confirmMessage, danger }: ActionFormProps) {
  function confirmFirst(event: FormEvent<HTMLFormElement>) {
    if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault()
  }

  return (
    <form action={action} onSubmit={confirmFirst}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className={`rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50 ${danger ? 'text-red-600 hover:bg-red-50' : 'text-zinc-800'}`}
      >
        {label}
      </button>
    </form>
  )
}

interface PostActionsProps {
  id: string
  status: PostStatus
  isLocked: boolean
}

export function PostActions({ id, status, isLocked }: PostActionsProps) {
  const canRetry = status === 'failed' || (status === 'cancelled' && isLocked)

  return (
    <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-6">
      {status === 'scheduled' && (
        <ActionForm action={cancelPostAction} id={id} label="Batalkan jadwal" confirmMessage="Batalkan jadwal post ini?" />
      )}
      {canRetry && (
        <ActionForm
          action={retryPostAction}
          id={id}
          label="Coba lagi"
          confirmMessage="Terbitkan post ini sekarang? Worker memeriksa Instagram dulu supaya tidak terbit dua kali."
        />
      )}
      <ActionForm action={duplicatePostAction} id={id} label="Duplikat" />
      {status !== 'publishing' && (
        <ActionForm
          action={deletePostAction}
          id={id}
          label="Hapus"
          danger
          confirmMessage={
            status === 'published'
              ? 'Hapus post dari aplikasi? Post di Instagram tidak ikut terhapus.'
              : 'Hapus post ini?'
          }
        />
      )}
    </div>
  )
}
