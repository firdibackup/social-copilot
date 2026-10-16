'use client'

import { LoaderCircle, Sparkles, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { deleteIdeaAction, generateIdeasAction } from './content-actions'

const FAILED = 'Gagal menghubungi server. Coba lagi.'

/** Ten new ideas from the brand kit. The cost shows before the click, since it uses credits. */
export function FindIdeasButton({ cost }: { cost: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(await generateIdeasAction().catch(() => FAILED))
          })
        }
        title={`Memakai ${cost} kuota AI`}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
      >
        {pending ? (
          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles size={14} aria-hidden="true" />
        )}
        {pending ? 'Mencari ide…' : `Cari ide · ${cost}`}
      </button>
      {error && (
        <p role="alert" className="mt-1 max-w-[240px] text-right text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export function DeleteIdeaButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      aria-label="Hapus ide"
      disabled={pending}
      onClick={() => startTransition(async () => void (await deleteIdeaAction(id).catch(() => FAILED)))}
      className="absolute top-1/2 right-0 -translate-y-1/2 rounded-md p-1.5 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-100 hover:text-ink focus-visible:opacity-100 disabled:opacity-40"
    >
      <X size={14} aria-hidden="true" />
    </button>
  )
}
