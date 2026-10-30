'use client'

import { ChevronDown, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { MediaImage } from '@/components/media-image'
import { REFERENCE_LABELS, type BrandReference } from '@/lib/brand-options'
import { AUTO_REFERENCE, type ReferenceOption } from '@/lib/content-options'

interface ReferencePickerProps {
  references: ReferenceOption[]
  /** AUTO_REFERENCE, '' for no reference, or a group's id. */
  value: string
  onChange: (value: string) => void
}

const CHIP = 'inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-zinc-50 px-2 py-1 text-xs text-ink-muted'
const CARD = 'block w-full rounded-xl border-2 p-3 text-left transition-colors'
const SELECTED = 'border-accent bg-accent-soft/40'
const UNSELECTED = 'border-hairline hover:bg-zinc-50'
const TAG = 'absolute top-1 left-1 rounded bg-zinc-900/80 px-1.5 py-0.5 text-[11px] font-medium text-white'
const FAILED = 'Referensi belum bisa dimuat. Coba lagi.'
/** Signed URLs last an hour; what was loaded a minute ago is shown again as is. */
const FRESH_MS = 60_000

/**
 * The Acuan chip of a new post: a button that opens the account's design references with every slide of each
 * group, Cover to CTA, so the owner sees what the slides will follow before choosing one.
 */
export function ReferencePicker({ references, value, onChange }: ReferencePickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [images, setImages] = useState<Record<string, BrandReference['images']>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedAt = useRef(0)
  const chosen = references.find((reference) => reference.id === value)
  const current = value === AUTO_REFERENCE ? 'Otomatis' : chosen ? chosen.label : 'Tanpa'

  async function load() {
    if (loading || Date.now() - loadedAt.current < FRESH_MS) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/content/references', { cache: 'no-store' })
      if (!response.ok || response.redirected) throw new Error('references_unavailable')
      const groups: BrandReference[] = await response.json()
      setImages(Object.fromEntries(groups.map((group) => [group.id, group.images])))
      loadedAt.current = Date.now()
    } catch {
      setError(FAILED)
    } finally {
      setLoading(false)
    }
  }

  function open() {
    dialogRef.current?.showModal()
    void load()
  }

  function pick(next: string) {
    onChange(next)
    dialogRef.current?.close()
  }

  return (
    <>
      <button type="button" onClick={open} className={`${CHIP} hover:bg-zinc-100`} title="Lihat dan pilih acuan desain">
        Acuan <span className="max-w-48 truncate font-medium text-ink">{current}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="acuan-heading"
        className="m-auto w-[min(56rem,calc(100%-2rem))] rounded-2xl p-0 backdrop:bg-[rgba(20,21,31,0.3)] backdrop:backdrop-blur-[2px]"
      >
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="acuan-heading" className="text-lg font-semibold text-ink">Pilih acuan desain</h2>
              <p className="text-sm text-ink-muted">Slide baru mengikuti layout dan gaya grup yang dipilih: cover, isi, sampai CTA.</p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Tutup"
              className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice selected={value === AUTO_REFERENCE} onClick={() => pick(AUTO_REFERENCE)} title="Otomatis · satu grup">
                AI memilih satu grup referensi utuh, jadi desain antar-slide tetap konsisten.
              </Choice>
              <Choice selected={value === ''} onClick={() => pick('')} title="Tanpa referensi">
                AI mendesain sendiri dari brand kit, tanpa mengikuti referensi.
              </Choice>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}{' '}
                <button type="button" onClick={() => void load()} className="underline">
                  Coba lagi
                </button>
              </p>
            )}
            {references.map((reference) => {
              const slides = images[reference.id]
              return (
                <button
                  key={reference.id}
                  type="button"
                  aria-pressed={value === reference.id}
                  onClick={() => pick(reference.id)}
                  className={`${CARD} ${value === reference.id ? SELECTED : UNSELECTED}`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium text-ink">
                    <span className="truncate">{reference.label}</span>
                    <span className="shrink-0 text-xs font-normal text-ink-muted">{reference.slideCount} gambar</span>
                  </span>
                  <span className="mt-2 flex flex-wrap gap-2">
                    {slides
                      ? slides.map((image, index) => (
                          <span key={image.id} className="relative">
                            <MediaImage src={image.url} className="h-28 max-w-48 rounded-md bg-zinc-100 object-contain" />
                            <span className={TAG}>
                              {REFERENCE_LABELS[image.label]} · {index + 1}
                            </span>
                          </span>
                        ))
                      : Array.from({ length: reference.slideCount }, (_, index) => (
                          <span key={index} aria-hidden="true" className={`h-28 w-[5.6rem] rounded-md bg-zinc-100 ${loading ? 'animate-pulse' : ''}`} />
                        ))}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </dialog>
    </>
  )
}

function Choice({ selected, onClick, title, children }: { selected: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`${CARD} ${selected ? SELECTED : UNSELECTED}`}>
      <span className="block text-sm font-medium text-ink">{title}</span>
      <span className="mt-1 block text-xs text-ink-muted">{children}</span>
    </button>
  )
}
