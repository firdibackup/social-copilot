'use client'

import { Ellipsis } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Post } from '@/lib/posts'
import { cancelPostAction, deletePostAction, duplicatePostAction, retryPostAction } from './actions'

interface MenuFormProps {
  action: (formData: FormData) => Promise<void>
  id: string
  label: string
  confirmMessage?: string
  danger?: boolean
}

function MenuForm({ action, id, label, confirmMessage, danger }: MenuFormProps) {
  function confirmFirst(event: FormEvent<HTMLFormElement>) {
    if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault()
  }

  return (
    <form action={action} onSubmit={confirmFirst}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        role="menuitem"
        className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${danger ? 'text-red-600 hover:bg-red-50' : 'text-ink hover:bg-zinc-100'}`}
      >
        {label}
      </button>
    </form>
  )
}

/** The ⋯ button: the post's status changes, a copy, and deleting it. */
export function MoreMenu({ post }: { post: Post }) {
  const [open, setOpen] = useState(false)
  const canRetry = post.status === 'failed' || (post.status === 'cancelled' && post.isLocked)

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Menu post"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 items-center justify-center rounded-xl border border-hairline bg-white text-ink shadow-[0_1px_3px_-1px_rgba(0,0,0,0.12)] transition-transform hover:scale-105"
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open && (
        <>
          {/* A click anywhere else closes the menu. */}
          <button type="button" aria-label="Tutup menu" tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <div
            role="menu"
            className="absolute top-12 left-0 z-40 w-60 animate-fade-in rounded-xl border border-hairline bg-white p-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]"
          >
            {post.status === 'scheduled' && (
              <MenuForm action={cancelPostAction} id={post.id} label="Batalkan jadwal" confirmMessage="Batalkan jadwal post ini?" />
            )}
            {canRetry && (
              <MenuForm
                action={retryPostAction}
                id={post.id}
                label="Coba terbitkan lagi"
                confirmMessage="Terbitkan post ini sekarang? Worker memeriksa Instagram dulu supaya tidak terbit dua kali."
              />
            )}
            <MenuForm action={duplicatePostAction} id={post.id} label="Duplikat sebagai draft" />
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer"
                role="menuitem"
                className="block rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-zinc-100"
              >
                Lihat di Instagram
              </a>
            )}
            {post.status !== 'publishing' && (
              <MenuForm
                action={deletePostAction}
                id={post.id}
                label="Hapus post"
                danger
                confirmMessage={
                  post.status === 'published' ? 'Hapus post dari aplikasi? Post di Instagram tidak ikut terhapus.' : 'Hapus post ini?'
                }
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
