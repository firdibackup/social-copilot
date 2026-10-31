'use client'

import { LoaderCircle, Sparkles, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { alertDialog } from '@/components/confirm-dialog'
import { deleteIdeaAction, generateIdeasAction, generateScriptAction } from './content-actions'
import { saveBeforeNavigation } from './use-save-before-navigation'

const FAILED = 'Gagal menghubungi server. Coba lagi.'

/** Enqueue before navigation: clicking an idea creates its durable draft exactly once. */
export function OpenIdeaButton({ id, ready, className, children }: { id: string; ready: boolean; className: string; children: ReactNode }) {
  const router = useRouter()
  const lock = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return <>
    <button type="button" disabled={pending} className={className} onClick={async () => {
      if (lock.current) return
      lock.current = true
      setPending(true)
      setError(null)
      if (!(await saveBeforeNavigation())) {
        lock.current = false
        setPending(false)
        return
      }
      if (ready) {
        router.push(`/buat?ide=${id}`)
        lock.current = false
        setPending(false)
        return
      }
      const result = await generateScriptAction(id).catch(() => ({ error: FAILED }))
      if ('error' in result) setError(result.error)
      else { router.push(`/buat?id=${result.postId}`); router.refresh() }
      lock.current = false
      setPending(false)
    }}>
      {pending ? <span role="status" className="text-sm">Menyimpan draft…</span> : children}
    </button>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </>
}

/** Ten new ideas from the brand kit. */
export function FindIdeasButton() {
  const button = useRef<HTMLButtonElement>(null)
  const scrollTop = useRef<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Restore the list's own scroller after the refreshed server tree commits,
  // before paint. Restoring inside the action would run before that update.
  useLayoutEffect(() => {
    if (pending || scrollTop.current === null) return
    const list = button.current?.closest<HTMLElement>('[data-content-list-scroll]')
    if (list) list.scrollTop = scrollTop.current
    scrollTop.current = null
  }, [pending])

  return (
    <div className="flex flex-col items-end">
      <button
        ref={button}
        type="button"
        disabled={pending}
        onClick={() => {
          const list = button.current?.closest<HTMLElement>('[data-content-list-scroll]')
          scrollTop.current = list?.scrollTop ?? null
          setError(null)
          startTransition(async () => {
            setError(await generateIdeasAction().catch(() => FAILED))
          })
        }}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
      >
        {pending ? (
          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles size={14} aria-hidden="true" />
        )}
        {pending ? 'Mencari ide…' : 'Cari ide'}
      </button>
      {error && (
        <p role="alert" className="mt-1 max-w-[240px] text-right text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export function DeleteIdeaButton({ id, hide, restore }: { id: string; hide: () => void; restore: () => void }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      aria-label="Hapus ide"
      disabled={pending}
      onClick={() => startTransition(async () => {
        hide()
        const error = await deleteIdeaAction(id).catch(() => FAILED)
        if (error) {
          restore()
          await alertDialog({ title: 'Ide tidak dapat dihapus', description: error, tone: 'danger' })
        }
      })}
      className="absolute top-1/2 right-0 -translate-y-1/2 rounded-md p-1.5 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-100 hover:text-ink focus-visible:opacity-100 disabled:opacity-40"
    >
      <X size={14} aria-hidden="true" />
    </button>
  )
}
