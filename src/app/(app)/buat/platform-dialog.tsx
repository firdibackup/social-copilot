'use client'

import { X } from 'lucide-react'
import { useState, useTransition, type ReactNode, type RefObject } from 'react'
import { InstagramIcon } from '@/components/instagram-icon'
import { Notice } from '@/components/notice'
import { ThreadsIcon } from '@/components/threads-icon'
import { setPlatformsAction } from './actions'

const FAILED = 'Gagal menghubungi server. Coba lagi.'
const LINK = 'font-medium text-ink underline underline-offset-2'

export type ThreadsLink = 'active' | 'needs_reconnect' | 'none'

interface PlatformDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>
  postId: string
  instagram: { enabled: boolean; username: string | null; locked: boolean }
  threads: { enabled: boolean; username: string | null; link: ThreadsLink; locked: boolean }
  /** The first slide as a Story too, once the feed post is out. */
  story: { enabled: boolean; locked: boolean }
}

/**
 * Posting ke mana: Instagram (with its Story) and Threads on or off for this post, each with the account it goes to.
 */
export function PlatformDialog({ dialogRef, postId, instagram, threads, story }: PlatformDialogProps) {
  const [instagramOn, setInstagramOn] = useState(instagram.enabled)
  const [storyOn, setStoryOn] = useState(story.enabled)
  const [threadsOn, setThreadsOn] = useState(threads.enabled)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setInstagramOn(instagram.enabled)
    setStoryOn(story.enabled)
    setThreadsOn(threads.enabled)
    setError(null)
  }

  function save() {
    startTransition(async () => {
      const failure = await setPlatformsAction({ postId, instagram: instagramOn, threads: threadsOn, story: storyOn }).catch(() => FAILED)
      if (failure) setError(failure)
      else dialogRef.current?.close()
    })
  }

  const threadsNote: ReactNode =
    threads.link === 'none' ? (
      <>
        Belum terhubung ·{' '}
        <a href="/api/auth/threads/start" className={LINK}>
          Hubungkan
        </a>
      </>
    ) : threads.link === 'needs_reconnect' ? (
      <>
        Perlu disambung ulang ·{' '}
        <a href="/api/auth/threads/start" className={LINK}>
          Hubungkan ulang
        </a>
      </>
    ) : threads.locked ? (
      'Sudah atau sedang terbit di Threads.'
    ) : null

  return (
    <dialog
      ref={dialogRef}
      onClose={reset}
      aria-labelledby="platform-heading"
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl p-0 backdrop:bg-[rgba(20,21,31,0.3)] backdrop:backdrop-blur-[2px]"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="platform-heading" className="text-lg font-semibold text-ink">
              Posting ke mana?
            </h2>
            <p className="text-sm text-ink-muted">Pilih akun tujuan untuk post ini.</p>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <ul className="divide-y divide-hairline rounded-xl border border-hairline">
          <PlatformRow
            icon={<InstagramIcon />}
            name="Instagram"
            username={instagram.username}
            checked={instagramOn}
            onChange={setInstagramOn}
            disabled={instagram.locked}
            note={instagram.locked ? 'Sudah atau sedang terbit di Instagram.' : null}
          >
            {instagramOn && (
              <label className="flex items-start gap-2.5 pl-12 text-sm">
                <input
                  type="checkbox"
                  checked={storyOn}
                  onChange={(event) => setStoryOn(event.target.checked)}
                  disabled={story.locked}
                  className="mt-0.5 size-4 shrink-0 accent-accent disabled:opacity-50"
                />
                <span>
                  <span className="block font-medium text-ink">Bagikan juga ke Story</span>
                  <span className="block text-xs text-ink-muted">
                    {story.locked
                      ? 'Post sudah atau sedang terbit, jadi pilihan Story tidak bisa diubah lagi.'
                      : 'Slide pertama jadi Story 9:16. Story tidak bisa pakai link, jadi kami arahkan orang ke nama akunmu.'}
                  </span>
                </span>
              </label>
            )}
          </PlatformRow>
          <PlatformRow
            icon={<ThreadsIcon />}
            name="Threads"
            username={threads.link === 'none' ? null : threads.username}
            checked={threadsOn}
            onChange={setThreadsOn}
            // Off stays possible without a connection; on needs one.
            disabled={threads.locked || (threads.link !== 'active' && !threadsOn)}
            note={threadsNote}
          />
        </ul>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-zinc-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || (!instagramOn && !threadsOn)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-60"
          >
            {pending ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

interface PlatformRowProps {
  icon: ReactNode
  name: string
  username: string | null
  checked: boolean
  onChange: (checked: boolean) => void
  disabled: boolean
  note: ReactNode
  /** Options under the row that only apply while it is on. */
  children?: ReactNode
}

function PlatformRow({ icon, name, username, checked, onChange, disabled, note, children }: PlatformRowProps) {
  return (
    <li className="space-y-3 p-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-ink">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{name}</span>
          <span className="block text-xs text-ink-muted">
            {username ? `@${username}` : null}
            {username && note ? ' · ' : null}
            {note}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={`Posting ke ${name}`}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-zinc-300'}`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
          />
        </button>
      </div>
      {children}
    </li>
  )
}
