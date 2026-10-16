'use client'

import { ArrowRight, CalendarClock } from 'lucide-react'
import { useActionState, useRef, type FormEvent, type MouseEvent } from 'react'
import { Notice } from '@/components/notice'
import { toWibInput, type Slot } from '@/lib/format'
import type { Post } from '@/lib/posts'
import { savePostAction, type SaveState } from './actions'

const PRIMARY =
  'rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-60'
const SECONDARY =
  'rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-zinc-50 disabled:opacity-60'

interface ScheduleButtonProps {
  post: Post
  /** The editor's current content, saved with the schedule. */
  caption: string
  assetIds: string[]
  slot: Slot
  disabled: boolean
}

function confirmNow(event: MouseEvent<HTMLButtonElement>) {
  if (!window.confirm('Terbitkan post ini ke Instagram sekarang?')) event.preventDefault()
}

/** Left: pick a date and time. Right: the suggested slot in one click. */
export function ScheduleButton({ post, caption, assetIds, slot, disabled }: ScheduleButtonProps) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(savePostAction, { error: null })
  const dialogRef = useRef<HTMLDialogElement>(null)
  const off = disabled || pending

  const content = (
    <>
      <input type="hidden" name="id" value={post.id} />
      <input type="hidden" name="caption" value={caption} />
      {assetIds.map((id) => (
        <input key={id} type="hidden" name="assetId" value={id} />
      ))}
    </>
  )

  function confirmSlot(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Jadwalkan post ini ${slot.label.toLowerCase()} WIB?`)) event.preventDefault()
  }

  return (
    <div className="ml-auto flex flex-col items-end gap-1.5">
      <div className="flex h-10">
        <button
          type="button"
          disabled={off}
          onClick={() => dialogRef.current?.showModal()}
          className="inline-flex items-center gap-2 rounded-l-xl bg-accent px-4 text-[14px] font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-60"
        >
          <CalendarClock size={17} aria-hidden="true" />
          {post.status === 'scheduled' ? 'Ubah jadwal' : 'Jadwalkan'}
        </button>
        <form action={formAction} onSubmit={confirmSlot} className="flex">
          {content}
          <input type="hidden" name="intent" value="schedule" />
          <input type="hidden" name="scheduledAt" value={slot.value} />
          <button
            type="submit"
            disabled={off}
            title={`Jadwalkan ${slot.label.toLowerCase()} WIB`}
            className="inline-flex items-center gap-1.5 rounded-r-xl border-l border-white/25 bg-accent px-3 text-[13px] font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-60"
          >
            {slot.label}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </form>
      </div>
      {state.error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-700">
          {state.error}
        </p>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="schedule-heading"
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl p-0 backdrop:bg-[rgba(20,21,31,0.3)] backdrop:backdrop-blur-[2px]"
      >
        <form action={formAction} className="space-y-4 p-5">
          {content}
          <h2 id="schedule-heading" className="text-lg font-semibold text-ink">
            Jadwalkan post
          </h2>
          <label className="block space-y-1 text-sm font-medium text-ink">
            <span>Tanggal dan jam (WIB)</span>
            <input
              name="scheduledAt"
              type="datetime-local"
              defaultValue={post.scheduledAt ? toWibInput(post.scheduledAt) : slot.value}
              className="block w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink focus:border-zinc-400 focus:outline-none"
            />
          </label>
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className={SECONDARY}>
              Batal
            </button>
            <button type="submit" name="intent" value="draft" disabled={pending} className={SECONDARY}>
              Simpan sebagai draft
            </button>
            <button type="submit" name="intent" value="now" disabled={pending} onClick={confirmNow} className={SECONDARY}>
              Terbitkan sekarang
            </button>
            <button type="submit" name="intent" value="schedule" disabled={pending} className={PRIMARY}>
              Jadwalkan
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
