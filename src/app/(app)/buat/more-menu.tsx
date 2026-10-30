'use client'

import { Ellipsis } from 'lucide-react'
import { PendingSubmit } from '@/components/pending-submit'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { Post } from '@/lib/posts'
import { cancelPostAction, deletePostNowAction, duplicatePostAction, publishThreadsNowAction, retryPostAction } from './actions'
import { editorKeys } from './editor-query'
import { useEditorScope } from './editor-provider'
import { setPostVisible } from './optimistic-events'

const ITEM = 'block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors'

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
      <PendingSubmit role="menuitem" pendingLabel="Memproses…"
        className={`${ITEM} ${danger ? 'text-red-600 hover:bg-red-50' : 'text-ink hover:bg-zinc-100'} disabled:opacity-50`}>
        {label}
      </PendingSubmit>
    </form>
  )
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" role="menuitem" className={`${ITEM} text-ink hover:bg-zinc-100`}>
      {label}
    </a>
  )
}

/**
 * Its Instagram schedule already ran (published or failed) while the Threads version failed, or was switched on
 * afterwards: Terbitkan ke Threads sends it on its own.
 */
function canPublishThreads(post: Post): boolean {
  const threads = post.threads
  if (!post.instagramEnabled || !threads?.enabled) return false
  if (post.status !== 'published' && post.status !== 'failed') return false
  return threads.status === 'failed' || (threads.status === 'pending' && threads.dueAt === null)
}

/** Where a deleted post stays: the platforms it already went out on. */
function publishedOn(post: Post): string | null {
  const instagram = post.instagramEnabled && post.status === 'published'
  const threads = post.threads?.status === 'published'
  if (instagram && threads) return 'Instagram dan Threads'
  return instagram ? 'Instagram' : threads ? 'Threads' : null
}

interface MoreMenuProps {
  post: Post
  /** Opens Pilih platform. */
  onPlatforms?: () => void
}

/** The ⋯ button: where the post goes, its status changes, a copy, and deleting it. */
export function MoreMenu({ post, onPlatforms }: MoreMenuProps) {
  const [open, setOpen] = useState(false)
  const [deleting, startDelete] = useTransition()
  const router = useRouter()
  const client = useQueryClient()
  const scope = useEditorScope()
  const canRetry = post.status === 'failed' || (post.status === 'cancelled' && post.isLocked)

  function remove() {
    if (deleting || !window.confirm(outOn ? `Hapus post dari aplikasi? Post di ${outOn} tidak ikut terhapus.` : 'Hapus post ini?')) return
    setOpen(false)
    startDelete(async () => {
      const key = editorKeys.detail(scope, post.id)
      await client.cancelQueries({ queryKey: key })
      const detail = client.getQueryData(key)
      const previousUrl = `${window.location.pathname}${window.location.search}`
      setPostVisible(post.id, false)
      window.history.replaceState(null, '', '/buat')
      client.removeQueries({ queryKey: key })
      const error = await deletePostNowAction(post.id).catch(() => 'Gagal menghubungi server. Coba lagi.')
      if (error) {
        setPostVisible(post.id, true)
        if (detail) client.setQueryData(key, detail)
        window.history.replaceState(null, '', previousUrl)
        window.alert(error)
      } else router.refresh()
    })
  }
  const outOn = publishedOn(post)

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
            {onPlatforms && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onPlatforms()
                }}
                className={`${ITEM} text-ink hover:bg-zinc-100`}
              >
                Pilih platform
              </button>
            )}
            {post.status === 'scheduled' && (
              <MenuForm action={cancelPostAction} id={post.id} label="Batalkan jadwal" confirmMessage="Batalkan jadwal post ini?" />
            )}
            {canRetry && (
              <MenuForm
                action={retryPostAction}
                id={post.id}
                label="Coba terbitkan lagi"
                confirmMessage={`Terbitkan post ini sekarang? Worker memeriksa ${post.instagramEnabled ? 'Instagram' : 'Threads'} dulu supaya tidak terbit dua kali.`}
              />
            )}
            {canPublishThreads(post) && (
              <MenuForm
                action={publishThreadsNowAction}
                id={post.id}
                label={post.threads?.status === 'failed' ? 'Coba lagi di Threads' : 'Terbitkan ke Threads'}
                confirmMessage="Terbitkan versi Threads post ini sekarang?"
              />
            )}
            <MenuForm action={duplicatePostAction} id={post.id} label="Duplikat sebagai draft" />
            {post.permalink && <MenuLink href={post.permalink} label="Lihat di Instagram" />}
            {post.threads?.permalink && <MenuLink href={post.threads.permalink} label="Lihat di Threads" />}
            {post.status !== 'publishing' && post.threads?.status !== 'publishing' && (
              <button type="button" role="menuitem" disabled={deleting} onClick={remove}
                className={`${ITEM} text-red-600 hover:bg-red-50 disabled:opacity-50`}>
                {deleting ? 'Menghapus…' : 'Hapus post'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
