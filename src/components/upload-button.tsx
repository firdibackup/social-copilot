'use client'

import { useTranslations } from 'next-intl'
import { commonTranslations } from './client-translations'
import { ImagePlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { uploadAsset, type UploadResult } from '@/app/(app)/(halaman)/aset/actions'
import type { Asset } from '@/lib/assets'
import { toInstagramJpeg } from '@/lib/image'
import { isStorageFull, showStorageFullDialog } from './storage-full'

/** Crops and re-encodes for Instagram in the browser, then stores it in Aset, inside product `groupId` if given. */
export async function prepareAndUpload(file: File, groupId?: string): Promise<UploadResult> {
  const t = commonTranslations()
  let prepared
  try {
    prepared = await toInstagramJpeg(file)
  } catch {
    return { error: t('upload.formatError') }
  }

  const formData = new FormData()
  formData.set('file', prepared.blob, 'foto.jpg')
  formData.set('width', String(prepared.width))
  formData.set('height', String(prepared.height))
  if (groupId) formData.set('groupId', groupId)
  try {
    return await uploadAsset(formData)
  } catch {
    return { error: t('upload.interrupted') }
  }
}

interface UploadButtonProps {
  /** Called with the photos that made it, in the order they were picked. */
  onUploaded?: (assets: Asset[]) => void
}

export function UploadButton({ onUploaded }: UploadButtonProps) {
  const t = useTranslations('common')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  async function upload(files: File[]) {
    const uploaded: Asset[] = []
    const failed: string[] = []
    for (const [index, file] of files.entries()) {
      setProgress(t('upload.progress', { current: index + 1, total: files.length }))
      const result = await prepareAndUpload(file)
      if ('asset' in result) uploaded.push(result.asset)
      else if (isStorageFull(result.error)) {
        // The rest would hit the same wall: stop, say it once, and offer the cleanup.
        const left = files.length - index
        failed.push(left === 1 ? t('upload.fileNotSaved', { name: file.name }) : t('upload.photosNotSaved', { count: left }))
        void showStorageFullDialog((href) => router.push(href))
        break
      } else failed.push(`${file.name}: ${result.error}`)
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
        {progress ?? t('upload.button')}
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
