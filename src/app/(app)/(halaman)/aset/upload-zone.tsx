'use client'

import { ImagePlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState, type DragEvent } from 'react'
import { prepareAndUpload } from '@/components/upload-button'
import type { AssetGroup } from '@/lib/assets'
import { TASK_CREDITS } from '@/lib/billing-options'
import { tagAssetsAction } from './actions'
import { FIELD, INITIAL_STATE } from './ui'

interface UploadZoneProps {
  groups: AssetGroup[]
  /** Preselected product, from the product filter. */
  defaultGroupId: string | null
}

/** Drop or pick photos, optionally straight into a product, and have AI tag them afterwards. */
export function UploadZone({ groups, defaultGroupId }: UploadZoneProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const [groupId, setGroupId] = useState(defaultGroupId ?? '')
  const [autoTag, setAutoTag] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [messages, setMessages] = useState<{ errors: string[]; note: string | null }>({ errors: [], note: null })

  const [lastDefault, setLastDefault] = useState(defaultGroupId)
  if (lastDefault !== defaultGroupId) {
    setLastDefault(defaultGroupId)
    setGroupId(defaultGroupId ?? '')
  }

  async function upload(files: File[]) {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    const uploaded: string[] = []
    const errors: string[] = []
    for (const [index, file] of images.entries()) {
      setProgress(`Mengunggah ${index + 1} dari ${images.length}…`)
      const result = await prepareAndUpload(file, groupId || undefined)
      if ('asset' in result) uploaded.push(result.asset.id)
      else errors.push(`${file.name}: ${result.error}`)
    }

    let note: string | null = null
    if (uploaded.length > 0 && autoTag) {
      setProgress('Membuat tag…')
      const data = new FormData()
      for (const assetId of uploaded) data.append('id', assetId)
      const tagged = await tagAssetsAction(INITIAL_STATE, data).catch(() => ({ error: 'Koneksi terputus.', success: null }))
      if (tagged.error) note = `Foto tersimpan, tetapi tag belum dibuat: ${tagged.error}`
    }
    setProgress(null)
    setMessages({ errors, note })
    if (uploaded.length > 0) router.refresh()
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (progress === null) void upload(Array.from(event.dataTransfer.files))
  }

  const busy = progress !== null
  return (
    <section aria-label="Unggah foto" className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={`flex flex-col gap-3 rounded-xl border-2 border-dashed p-4 transition-colors sm:flex-row sm:items-center ${
          dragging ? 'border-accent bg-accent-soft' : 'border-zinc-300 bg-zinc-50/60'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (files.length > 0) void upload(files)
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep disabled:opacity-60"
        >
          <ImagePlus size={16} aria-hidden="true" />
          {progress ?? 'Unggah foto'}
        </button>
        <p className="hidden text-sm text-ink-muted lg:block">atau tarik foto ke sini.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">
          <label htmlFor={`${id}-produk`} className="flex items-center gap-2 text-sm text-ink">
            <span className="shrink-0">Masukkan ke produk</span>
            <select
              id={`${id}-produk`}
              value={groupId}
              disabled={busy}
              onChange={(event) => setGroupId(event.target.value)}
              className={`${FIELD} max-w-48 min-h-9`}
            >
              <option value="">Tidak ada</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={autoTag}
              disabled={busy}
              onChange={(event) => setAutoTag(event.target.checked)}
              className="size-4 accent-teal-700"
            />
            Tag otomatis dengan AI
            <span className="text-xs text-ink-muted">({TASK_CREDITS.asset_tags} kredit/foto)</span>
          </label>
        </div>
      </div>
      {(messages.errors.length > 0 || messages.note) && (
        <ul role="alert" className="space-y-0.5 text-sm text-red-700">
          {messages.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
          {messages.note && <li className="text-amber-700">{messages.note}</li>}
        </ul>
      )}
    </section>
  )
}
