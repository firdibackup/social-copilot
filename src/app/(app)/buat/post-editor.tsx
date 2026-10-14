'use client'

import { ArrowLeft, ArrowRight, Check, ImagePlus, X } from 'lucide-react'
import { useActionState, useRef, useState, type MouseEvent } from 'react'
import { MediaImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import { UploadButton } from '@/components/upload-button'
import type { Asset } from '@/lib/assets'
import { CAPTION_MAX_HASHTAGS, CAPTION_MAX_LENGTH, CAPTION_MAX_MENTIONS, inspectCaption } from '@/lib/caption'
import { toWibInput } from '@/lib/format'
import type { Post } from '@/lib/posts'
import { savePostAction, type SaveState } from './actions'

const MAX_MEDIA = 10
const EDITABLE_STATUSES = new Set(['draft', 'scheduled', 'failed', 'cancelled'])

const PRIMARY_BUTTON =
  'rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60'
const SECONDARY_BUTTON =
  'rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60'
const ICON_BUTTON = 'rounded p-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30'

function confirmPublishNow(event: MouseEvent<HTMLButtonElement>) {
  if (!window.confirm('Terbitkan post ini ke Instagram sekarang?')) event.preventDefault()
}

interface PostEditorProps {
  post: Post | null
  library: Asset[]
  /** `datetime-local` value for a new post opened from a calendar day. */
  defaultSchedule: string
}

export function PostEditor({ post, library: initialLibrary, defaultSchedule }: PostEditorProps) {
  const editable = !post || (EDITABLE_STATUSES.has(post.status) && !post.isLocked)
  const [media, setMedia] = useState<Asset[]>(
    post?.media.map((item) => ({ id: item.assetId, url: item.url, width: item.width, height: item.height })) ?? [],
  )
  const [library, setLibrary] = useState(initialLibrary)
  const [caption, setCaption] = useState(post?.caption ?? '')
  const [state, formAction, pending] = useActionState<SaveState, FormData>(savePostAction, { error: null })
  const pickerRef = useRef<HTMLDialogElement>(null)

  const counts = inspectCaption(caption)
  const cover = media[0]
  const ratio = cover ? `${cover.width} / ${cover.height}` : '1 / 1'

  function toggle(asset: Asset) {
    setMedia((current) =>
      current.some((item) => item.id === asset.id)
        ? current.filter((item) => item.id !== asset.id)
        : current.length < MAX_MEDIA
          ? [...current, asset]
          : current,
    )
  }

  function move(index: number, offset: -1 | 1) {
    setMedia((current) => {
      const next = [...current]
      ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
      return next
    })
  }

  function addUploaded(uploaded: Asset[]) {
    setLibrary((current) => [...uploaded, ...current])
    setMedia((current) => [...current, ...uploaded].slice(0, MAX_MEDIA))
  }

  return (
    <>
      <form action={formAction} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <input type="hidden" name="id" value={post?.id ?? ''} />
          {media.map((asset) => (
            <input key={asset.id} type="hidden" name="assetId" value={asset.id} />
          ))}

          <section aria-labelledby="media-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="media-heading" className="text-sm font-medium text-zinc-900">
                Foto <span className="font-normal text-zinc-500">({media.length}/{MAX_MEDIA})</span>
              </h2>
              {editable && (
                <button type="button" onClick={() => pickerRef.current?.showModal()} className={SECONDARY_BUTTON}>
                  <span className="inline-flex items-center gap-2">
                    <ImagePlus size={16} aria-hidden="true" />
                    Pilih foto
                  </span>
                </button>
              )}
            </div>
            {media.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
                Belum ada foto. Satu foto terbit sebagai post biasa; dua sampai sepuluh foto terbit sebagai carousel.
              </p>
            ) : (
              <ol className="flex gap-3 overflow-x-auto pb-1">
                {media.map((asset, index) => (
                  <li key={asset.id} className="w-28 shrink-0 space-y-1">
                    <div style={{ aspectRatio: ratio }} className="overflow-hidden rounded-lg bg-zinc-100">
                      <MediaImage src={asset.url} className="size-full object-cover" />
                    </div>
                    {editable && (
                      <div className="flex justify-center gap-1">
                        <button type="button" aria-label="Geser ke kiri" disabled={index === 0} onClick={() => move(index, -1)} className={ICON_BUTTON}>
                          <ArrowLeft size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label="Geser ke kanan"
                          disabled={index === media.length - 1}
                          onClick={() => move(index, 1)}
                          className={ICON_BUTTON}
                        >
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="Lepas foto" onClick={() => toggle(asset)} className={ICON_BUTTON}>
                          <X size={16} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {media.length > 1 && (
              <p className="text-xs text-zinc-500">Instagram memotong semua foto carousel mengikuti rasio foto pertama.</p>
            )}
          </section>

          <section className="space-y-2">
            <label htmlFor="caption" className="text-sm font-medium text-zinc-900">
              Caption
            </label>
            <textarea
              id="caption"
              name="caption"
              rows={8}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              readOnly={!editable}
              className="w-full rounded-lg border border-zinc-200 p-3 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none read-only:bg-zinc-50"
            />
            <p className="flex flex-wrap gap-x-4 text-xs text-zinc-500">
              <Count value={counts.length} max={CAPTION_MAX_LENGTH} label="karakter" />
              <Count value={counts.hashtags} max={CAPTION_MAX_HASHTAGS} label="hashtag" />
              <Count value={counts.mentions} max={CAPTION_MAX_MENTIONS} label="mention" />
            </p>
          </section>

          <section className="space-y-2">
            <label htmlFor="scheduledAt" className="text-sm font-medium text-zinc-900">
              Jadwal <span className="font-normal text-zinc-500">(WIB)</span>
            </label>
            <input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              defaultValue={post?.scheduledAt ? toWibInput(post.scheduledAt) : defaultSchedule}
              disabled={!editable}
              className="block rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-50"
            />
          </section>

          {state.error && <Notice tone="error">{state.error}</Notice>}

          {editable && (
            <div className="flex flex-wrap gap-2">
              <button type="submit" name="intent" value="schedule" disabled={pending} className={PRIMARY_BUTTON}>
                {post?.status === 'scheduled' ? 'Simpan jadwal' : 'Jadwalkan'}
              </button>
              <button
                type="submit"
                name="intent"
                value="now"
                disabled={pending}
                onClick={confirmPublishNow}
                className={SECONDARY_BUTTON}
              >
                Terbitkan sekarang
              </button>
              <button type="submit" name="intent" value="draft" disabled={pending} className={SECONDARY_BUTTON}>
                Simpan sebagai draft
              </button>
            </div>
          )}
        </div>

        <aside aria-label="Pratinjau" className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-900">Pratinjau</h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {cover ? (
              <div style={{ aspectRatio: ratio }} className="relative bg-zinc-100">
                <MediaImage src={cover.url} className="absolute inset-0 size-full object-cover" />
                {media.length > 1 && (
                  <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                    1/{media.length}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex aspect-square items-center justify-center bg-zinc-50 text-sm text-zinc-400">
                Belum ada foto
              </div>
            )}
            <p className="p-3 text-sm break-words whitespace-pre-wrap text-zinc-800">
              {caption || <span className="text-zinc-400">Caption kosong</span>}
            </p>
          </div>
        </aside>
      </form>

      <dialog
        ref={pickerRef}
        aria-labelledby="picker-heading"
        className="m-auto w-[min(56rem,calc(100%-2rem))] rounded-xl p-0 backdrop:bg-black/40"
      >
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="picker-heading" className="text-lg font-medium text-zinc-900">
              Pilih foto <span className="text-sm font-normal text-zinc-500">({media.length}/{MAX_MEDIA})</span>
            </h2>
            <UploadButton onUploaded={addUploaded} />
          </div>
          {library.length === 0 ? (
            <p className="text-sm text-zinc-500">Belum ada foto di Aset. Unggah dari sini.</p>
          ) : (
            <ul className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
              {library.map((asset) => {
                const position = media.findIndex((item) => item.id === asset.id)
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      aria-pressed={position >= 0}
                      aria-label={position >= 0 ? `Foto ke-${position + 1}, lepas` : 'Pilih foto'}
                      onClick={() => toggle(asset)}
                      className={`relative block w-full overflow-hidden rounded-lg border-2 ${position >= 0 ? 'border-zinc-900' : 'border-transparent'}`}
                    >
                      <MediaImage src={asset.url} className="aspect-square w-full object-cover" />
                      {position >= 0 && (
                        <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-zinc-900 text-xs text-white">
                          {position + 1}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={() => pickerRef.current?.close()} className={PRIMARY_BUTTON}>
              <span className="inline-flex items-center gap-2">
                <Check size={16} aria-hidden="true" />
                Selesai
              </span>
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}

function Count({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <span className={value > max ? 'font-medium text-red-600' : undefined}>
      {value.toLocaleString('id-ID')}/{max.toLocaleString('id-ID')} {label}
    </span>
  )
}
