'use client'

import { Check } from 'lucide-react'
import type { RefObject } from 'react'
import { MediaImage } from '@/components/media-image'
import { UploadButton } from '@/components/upload-button'
import type { Asset } from '@/lib/assets'

interface PhotoPickerProps {
  dialogRef: RefObject<HTMLDialogElement | null>
  library: Asset[]
  /** Asset ids in the post, in order. */
  selected: string[]
  max: number
  onToggle: (asset: Asset) => void
  onUploaded: (assets: Asset[]) => void
  /** When the owner closes the picker with Selesai. */
  onDone: () => void
}

/** The owner's own photos from Aset, or new uploads, as slides. */
export function PhotoPicker({ dialogRef, library, selected, max, onToggle, onUploaded, onDone }: PhotoPickerProps) {
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="picker-heading"
      className="m-auto w-[min(56rem,calc(100%-2rem))] rounded-2xl p-0 backdrop:bg-[rgba(20,21,31,0.3)] backdrop:backdrop-blur-[2px]"
    >
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="picker-heading" className="text-lg font-semibold text-ink">
            Pilih foto{' '}
            <span className="text-sm font-normal text-ink-muted">
              ({selected.length}/{max})
            </span>
          </h2>
          <UploadButton onUploaded={onUploaded} />
        </div>
        {library.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada foto di Aset. Unggah dari sini.</p>
        ) : (
          <ul className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
            {library.map((asset) => {
              const position = selected.indexOf(asset.id)
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    aria-pressed={position >= 0}
                    aria-label={position >= 0 ? `Foto ke-${position + 1}, lepas` : 'Pilih foto'}
                    onClick={() => onToggle(asset)}
                    className={`relative block w-full overflow-hidden rounded-lg border-2 ${position >= 0 ? 'border-accent' : 'border-transparent'}`}
                  >
                    <MediaImage src={asset.url} className="aspect-square w-full object-cover" />
                    {position >= 0 && (
                      <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-accent text-xs text-white">
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
          <button
            type="button"
            onClick={() => {
              dialogRef.current?.close()
              onDone()
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
          >
            <Check size={16} aria-hidden="true" />
            Selesai
          </button>
        </div>
      </div>
    </dialog>
  )
}
