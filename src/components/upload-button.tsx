'use client'

import { ImagePlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { uploadAsset, type UploadResult } from '@/app/(app)/(halaman)/aset/actions'
import type { Asset } from '@/lib/assets'
import { toInstagramJpeg } from '@/lib/image'

/** Crops and re-encodes for Instagram in the browser, then stores it in Aset. Also used for AI images. */
export async function prepareAndUpload(file: File): Promise<UploadResult> {
  let prepared
  try {
    prepared = await toInstagramJpeg(file)
  } catch {
    return { error: 'Format tidak bisa dibaca browser. Ubah ke JPG atau PNG dulu.' }
  }

  const formData = new FormData()
  formData.set('file', prepared.blob, 'foto.jpg')
  formData.set('width', String(prepared.width))
  formData.set('height', String(prepared.height))
  try {
    return await uploadAsset(formData)
  } catch {
    return { error: 'Unggahan terputus. Coba lagi.' }
  }
}

interface UploadButtonProps {
  /** Called with the photos that made it, in the order they were picked. */
  onUploaded?: (assets: Asset[]) => void
}

export function UploadButton({ onUploaded }: UploadButtonProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  async function upload(files: File[]) {
    const uploaded: Asset[] = []
    const failed: string[] = []
    for (const [index, file] of files.entries()) {
      setProgress(`Mengunggah ${index + 1} dari ${files.length}…`)
      const result = await prepareAndUpload(file)
      if ('asset' in result) uploaded.push(result.asset)
      else failed.push(`${file.name}: ${result.error}`)
    }
    setProgress(null)
    setErrors(failed)
    if (uploaded.length > 0) {
      onUploaded?.(uploaded)
      router.refresh()
    }
  }

  return (
    <div className="space-y-2">
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
        disabled={progress !== null}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
      >
        <ImagePlus size={16} aria-hidden="true" />
        {progress ?? 'Unggah foto'}
      </button>
      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-sm text-red-700">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
