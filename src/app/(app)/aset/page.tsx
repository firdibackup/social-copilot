import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { MediaImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import { UploadButton } from '@/components/upload-button'
import { listAssets, type Asset } from '@/lib/assets'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { DeleteAssetButton } from './delete-asset-button'

export const metadata: Metadata = { title: 'Aset' }

export default function AsetPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Aset</h1>
          <p className="text-zinc-500">
            Foto untuk post. Saat diunggah, foto dipotong ke rasio 4:5 sampai 1.91:1 dan disimpan sebagai JPEG, persis
            seperti yang dikirim ke Instagram.
          </p>
        </div>
        <UploadButton />
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-500">Memuat foto…</p>}>
        <AssetGrid />
      </Suspense>
    </div>
  )
}

async function AssetGrid() {
  await connection()
  let assets: Asset[]
  try {
    assets = await listAssets()
  } catch (error) {
    console.error('[aset] gagal memuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  if (assets.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        Belum ada foto. Unggah foto pertama untuk mulai membuat post.
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {assets.map((asset) => (
        <li key={asset.id} className="relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
          <MediaImage src={asset.url} className="aspect-square w-full object-cover" />
          <DeleteAssetButton id={asset.id} />
        </li>
      ))}
    </ul>
  )
}
