'use client'

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from '@/components/avatar'
import { CancelGenerationButton } from '@/components/cancel-generation-button'
import { MediaImage } from '@/components/media-image'
import type { ImageFormat } from '@/lib/image-options'
import type { PostMedia } from '@/lib/posts'

/** An AI slide whose image isn't in the post yet. */
export interface SlideView {
  id: string
  position: number
  format: ImageFormat
  status: 'pending' | 'generating' | 'failed' | 'cancelled'
  /** Why it failed; on a waiting slide, why the worker is trying it again. */
  error: string | null
}

export type SlideItem = { kind: 'image'; key: string; media: PostMedia } | { kind: 'slide'; key: string; slide: SlideView }

interface PostMockupProps {
  username: string
  avatarUrl: string | null
  items: SlideItem[]
  active: number
  onSelect: (index: number) => void
  /** CSS aspect-ratio; Instagram crops every carousel image to the first one's. */
  ratio: string
  /** The active image is being remade. */
  remaking: boolean
  /** The failed slide this tab is putting back in the queue right now. */
  running: string | null
  /** Photos can be moved and removed. */
  editable: boolean
  onRemove: (assetId: string) => void
  onMove: (index: number, offset: -1 | 1) => void
  onRetry: (slideId: string) => void
  onDropSlide: (slideId: string) => void
  onCancelSlide: (slideId: string) => void
  cancelling: boolean
  /** Under the image, as in the feed. */
  caption: ReactNode
  /** Shown in place of the image when the post has none yet and none can be added here. */
  empty: ReactNode
  /** Opens the photo picker. Set while photos can be added: a card after the last slide and a tile in the strip. */
  onAdd?: () => void
  /** How many photos a post can hold. */
  maxSlides: number
}

const ROUND_BUTTON =
  'flex size-8 items-center justify-center rounded-full bg-white/95 text-ink shadow-[0_1px_3px_-1px_rgba(0,0,0,0.3)] transition-transform hover:scale-105'

/**
 * The post as it will look in the Instagram feed, with its slides beside it. While photos can be added, the slide
 * after the last one is a card that opens the picker, as Instagram's own composer has.
 */
export function PostMockup(props: PostMockupProps) {
  const { username, avatarUrl, items, active, onSelect, ratio, caption, empty, onAdd, maxSlides } = props
  const current = items[active]
  const slots = items.length + (onAdd ? 1 : 0)

  return (
    <div className="flex justify-center gap-3">
      {slots > 1 && (
        <SlideStrip {...props} className="hidden max-h-[560px] w-14 shrink-0 flex-col gap-2 overflow-y-auto md:flex" />
      )}
      <div className="w-full max-w-[340px] space-y-2">
        <article aria-label="Pratinjau post" className="overflow-hidden rounded-xl border border-hairline bg-white">
          <header className="flex items-center gap-2 px-3 py-2.5">
            <Avatar src={avatarUrl} name={username} className="size-8" />
            <span className="truncate text-[13px] font-semibold text-ink">{username}</span>
          </header>
          <div className="relative bg-zinc-100" style={{ aspectRatio: ratio }}>
            {current ? (
              <Stage {...props} item={current} />
            ) : onAdd ? (
              <AddCard count={items.length} max={maxSlides} onAdd={onAdd} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-muted">{empty}</div>
            )}
            {current && items.length > 1 && (
              <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                {active + 1}/{items.length}
              </span>
            )}
            {active > 0 && (
              <button type="button" aria-label="Slide sebelumnya" onClick={() => onSelect(active - 1)} className={`${ROUND_BUTTON} absolute top-1/2 left-2 -translate-y-1/2`}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
            )}
            {active < slots - 1 && (
              <button type="button" aria-label="Slide berikutnya" onClick={() => onSelect(active + 1)} className={`${ROUND_BUTTON} absolute top-1/2 right-2 -translate-y-1/2`}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="space-y-2 px-3 pt-2.5 pb-3">
            <div className="flex gap-3 text-ink" aria-hidden="true">
              <Heart size={20} strokeWidth={1.75} />
              <MessageCircle size={20} strokeWidth={1.75} />
              <Send size={20} strokeWidth={1.75} />
            </div>
            {caption}
          </div>
        </article>
        {slots > 1 && <SlideStrip {...props} className="flex gap-2 overflow-x-auto pb-1 md:hidden" />}
      </div>
    </div>
  )
}

function Stage({ item, remaking, running, editable, onRemove, onRetry, onDropSlide, onCancelSlide, cancelling }: PostMockupProps & { item: SlideItem }) {
  if (item.kind === 'image') {
    return (
      <>
        <MediaImage src={item.media.url} className="absolute inset-0 size-full object-cover" />
        {remaking && (
          <div className="shimmer absolute inset-0 flex items-center justify-center opacity-90">
            <Working label="Membuat ulang slide…" />
          </div>
        )}
        {editable && !remaking && (
          <button
            type="button"
            aria-label="Lepas foto ini dari post"
            onClick={() => onRemove(item.media.assetId)}
            className={`${ROUND_BUTTON} absolute top-2.5 right-2.5`}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        )}
      </>
    )
  }

  const { slide } = item
  if (slide.status === 'cancelled' && slide.id !== running) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-50 p-6 text-center">
        <p role="status" className="text-sm text-ink-muted">Pembuatan gambar dibatalkan.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => onRetry(slide.id)} className="min-h-9 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-deep">Buat lagi (gratis)</button>
          <button type="button" onClick={() => onDropSlide(slide.id)} className="min-h-9 rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink hover:bg-zinc-100">Hapus slide</button>
        </div>
      </div>
    )
  }
  if (slide.status === 'failed' && slide.id !== running) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-red-50 p-6 text-center">
        <AlertTriangle size={22} className="text-red-600" aria-hidden="true" />
        <p className="text-sm text-red-800">{slide.error ?? 'Slide gagal dibuat.'}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => onRetry(slide.id)} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-deep">
            Coba lagi (gratis)
          </button>
          <button type="button" onClick={() => onDropSlide(slide.id)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-100">
            Hapus slide
          </button>
        </div>
      </div>
    )
  }
  const making = slide.id === running || slide.status === 'generating'
  return (
    <div className="shimmer absolute inset-0 flex flex-col items-center justify-center gap-3">
      <Working
        label={making ? `Membuat slide ${slide.position + 1}…` : slide.error ? 'Gagal sebentar, dicoba lagi otomatis…' : 'Menunggu giliran…'}
        spinning={making}
      />
      <CancelGenerationButton label="Batal gambar ini" onClick={() => onCancelSlide(slide.id)} pending={cancelling} />
    </div>
  )
}

function AddCard({ count, max, onAdd }: { count: number; max: number; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-50 p-6 text-center transition-colors hover:bg-zinc-100"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-white text-ink shadow-[0_1px_3px_-1px_rgba(0,0,0,0.3)]">
        <ImagePlus size={24} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-ink">Tambah foto</span>
      <span className="text-xs text-ink-muted">
        {count}/{max} slide
      </span>
    </button>
  )
}

function Working({ label, spinning = true }: { label: string; spinning?: boolean }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-ink">
      {spinning && <LoaderCircle size={14} className="animate-spin-slow" aria-hidden="true" />}
      {label}
    </span>
  )
}

function SlideStrip({ items, active, onSelect, running, editable, onMove, onAdd, className }: PostMockupProps & { className: string }) {
  const current = items[active]
  const images = items.filter((item) => item.kind === 'image').length
  return (
    <div className={className}>
      <ol className="contents">
        {items.map((item, index) => (
          <li key={item.key} className="shrink-0">
            <button
              type="button"
              aria-label={`Slide ${index + 1}`}
              aria-current={index === active ? 'true' : undefined}
              onClick={() => onSelect(index)}
              className={`block size-14 overflow-hidden rounded-lg border-2 transition-colors ${index === active ? 'border-accent' : 'border-transparent hover:border-hairline'}`}
            >
              {item.kind === 'image' ? (
                <MediaImage src={item.media.url} className="size-full object-cover" />
              ) : item.slide.status === 'cancelled' && item.slide.id !== running ? (
                <span className="flex size-full items-center justify-center bg-zinc-100 text-xs text-ink-muted">Batal</span>
              ) : item.slide.status === 'failed' && item.slide.id !== running ? (
                <span className="flex size-full items-center justify-center bg-red-50 text-red-600">
                  <AlertTriangle size={16} aria-hidden="true" />
                </span>
              ) : (
                <span className="shimmer block size-full" />
              )}
            </button>
          </li>
        ))}
        {onAdd && (
          <li className="shrink-0">
            <button
              type="button"
              aria-label="Tambah foto"
              title="Tambah foto"
              onClick={onAdd}
              className="flex size-14 items-center justify-center rounded-lg border-2 border-dashed border-hairline text-ink-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </li>
        )}
      </ol>
      {editable && current?.kind === 'image' && images > 1 && (
        <div className="flex shrink-0 justify-center gap-1 md:flex-col">
          <button type="button" aria-label="Geser slide ke depan" disabled={active === 0} onClick={() => onMove(active, -1)} className="rounded p-1 text-ink-muted hover:bg-zinc-100 disabled:opacity-30">
            <ArrowUp size={16} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Geser slide ke belakang" disabled={active >= images - 1} onClick={() => onMove(active, 1)} className="rounded p-1 text-ink-muted hover:bg-zinc-100 disabled:opacity-30">
            <ArrowDown size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
