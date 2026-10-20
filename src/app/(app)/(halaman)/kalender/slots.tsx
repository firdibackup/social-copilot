'use client'

import { CalendarClock, ChevronDown, Layers, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { InstagramIcon } from '@/components/instagram-icon'
import { MediaImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import { SlotEditor } from '@/components/slot-editor'
import { ThreadsIcon } from '@/components/threads-icon'
import type { PostingSlot } from '@/lib/schedule-slots'
import { fillSlotAction } from './actions'

/** A chip asks the page's one picker to open; the drafts list is sent to the page once, not per chip. */
const PICK_EVENT = 'kalender:pilih-slot'
const FAILED = 'Gagal menghubungi server. Coba lagi.'
const DIALOG =
  'm-auto w-[min(40rem,calc(100%-2rem))] rounded-2xl p-0 backdrop:bg-[rgba(20,21,31,0.3)] backdrop:backdrop-blur-[2px]'
const CLOSE = 'rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900'

/** An empty slot as Kalender shows it. */
export interface OpenSlot {
  /** WIB `datetime-local` value, also what Buat takes as `?slot=`. */
  value: string
  /** e.g. "Kamis, 22 Oktober". */
  day: string
  /** e.g. "19.00". */
  time: string
}

/** A finished draft Pilih can put in a slot. */
export interface DraftCard {
  id: string
  label: string
  subtitle: string
  coverUrl: string | null
  slideCount: number
  instagram: boolean
  threads: boolean
}

const buatHref = (slot: OpenSlot) => `/buat?baru=1&slot=${encodeURIComponent(slot.value)}`

/** "Slot 19.00": a click opens it into Buat (a new post for this slot) and Pilih (a finished draft). */
export function SlotChip({ slot }: { slot: OpenSlot }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Slot kosong ${slot.day} ${slot.time}`}
        className="block w-full truncate rounded-md border border-dashed border-zinc-300 px-1.5 py-0.5 text-left text-xs text-zinc-500 transition-colors hover:border-accent hover:text-accent"
      >
        Slot {slot.time}
      </button>
    )
  }
  return (
    <div ref={box} className="flex gap-1 animate-fade-in">
      <Link
        href={buatHref(slot)}
        className="inline-flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-md bg-accent px-1 py-0.5 text-xs font-semibold text-white hover:bg-accent-deep"
      >
        <Plus size={12} aria-hidden="true" />
        Buat
      </Link>
      <button
        type="button"
        autoFocus
        onClick={() => {
          setOpen(false)
          window.dispatchEvent(new CustomEvent<OpenSlot>(PICK_EVENT, { detail: slot }))
        }}
        className="inline-flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-md border border-zinc-200 bg-white px-1 py-0.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
      >
        <ChevronDown size={12} aria-hidden="true" />
        Pilih
      </button>
    </div>
  )
}

/** Pilih: the page's finished drafts as cards; a click puts that post in the slot. */
export function SlotPicker({ drafts }: { drafts: DraftCard[] }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [slot, setSlot] = useState<OpenSlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const open = (event: Event) => {
      setSlot((event as CustomEvent<OpenSlot>).detail)
      setError(null)
      dialog.current?.showModal()
    }
    window.addEventListener(PICK_EVENT, open)
    return () => window.removeEventListener(PICK_EVENT, open)
  }, [])

  function pick(postId: string) {
    if (!slot) return
    setPicking(postId)
    setError(null)
    startTransition(async () => {
      const failure = await fillSlotAction(postId, slot.value).catch(() => FAILED)
      setPicking(null)
      if (failure) setError(failure)
      else dialog.current?.close()
    })
  }

  return (
    <dialog ref={dialog} aria-labelledby="pilih-judul" className={DIALOG}>
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="pilih-judul" className="text-lg font-semibold text-ink">
              {slot?.day}
            </h2>
            <p className="text-sm text-ink-muted">Pilih post jadi untuk slot {slot?.time} WIB.</p>
          </div>
          <button type="button" aria-label="Tutup" onClick={() => dialog.current?.close()} className={CLOSE}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-ink-muted">
            <p>Belum ada post jadi yang belum terjadwal.</p>
            {slot && (
              <Link href={buatHref(slot)} className="mt-2 inline-block font-medium text-ink underline">
                Buat post untuk slot ini
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => pick(draft.id)}
                  className="flex w-full items-start gap-3 rounded-xl border border-hairline bg-white p-3 text-left transition-colors hover:border-accent disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-semibold text-ink">{draft.label}</span>
                    {draft.subtitle && (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-ink-muted">{draft.subtitle}</span>
                    )}
                    <span className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                      <Layers size={12} aria-hidden="true" />
                      {picking === draft.id ? 'Menjadwalkan…' : `${draft.slideCount} slide · ${slot?.time ?? ''}`}
                      {draft.instagram && <InstagramIcon width={12} height={12} />}
                      {draft.threads && <ThreadsIcon size={12} />}
                    </span>
                  </span>
                  {draft.coverUrl ? (
                    <MediaImage src={draft.coverUrl} className="size-14 shrink-0 rounded-lg bg-zinc-100 object-cover" />
                  ) : (
                    <span className="size-14 shrink-0 rounded-lg bg-zinc-100" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  )
}

/** The header's Slot posting button: the slot table in a dialog. */
export function SlotsButton({ slots, isDefault }: { slots: PostingSlot[]; isDefault: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
      >
        <CalendarClock size={16} aria-hidden="true" />
        Slot posting
      </button>
      <dialog ref={dialog} aria-labelledby="slot-judul" className={DIALOG}>
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id="slot-judul" className="text-lg font-semibold text-ink">
              Slot posting
            </h2>
            <button type="button" aria-label="Tutup" onClick={() => dialog.current?.close()} className={CLOSE}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <SlotEditor initialSlots={slots} isDefault={isDefault} />
        </div>
      </dialog>
    </>
  )
}
