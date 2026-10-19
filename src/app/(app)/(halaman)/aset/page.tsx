import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Notice } from '@/components/notice'
import { listAssetLibrary, type AssetLibrary } from '@/lib/assets'
import { requireAccount } from '@/lib/auth'
import { getBrandFields } from '@/lib/brand'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { AssetLibraryView } from './asset-library'

export const metadata: Metadata = { title: 'Aset' }

export default function AsetPage() {
  return (
    <div className="space-y-6">
      <header className="max-w-2xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Aset</h1>
        <p className="text-zinc-500">
          Foto milikmu, dari website, dan hasil AI. Kelompokkan foto per produk agar AI memakai produk yang benar saat
          membuat konten.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-500">Memuat foto…</p>}>
        <AssetGrid />
      </Suspense>
    </div>
  )
}

/** The website only fills the Dari website card; Aset still works when Brand can't be read. */
async function websiteOf(userId: string, accountId: string): Promise<string> {
  try {
    return (await getBrandFields(userId, accountId))?.websiteUrl ?? ''
  } catch (error) {
    console.error('[aset] website brand gagal dimuat:', describeError(error))
    return ''
  }
}

async function AssetGrid() {
  await connection()
  const { userId, accountId } = await requireAccount()
  let library: AssetLibrary
  let websiteUrl: string
  try {
    ;[library, websiteUrl] = await Promise.all([listAssetLibrary(userId, accountId), websiteOf(userId, accountId)])
  } catch (error) {
    console.error('[aset] gagal memuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  return <AssetLibraryView library={library} websiteUrl={websiteUrl} />
}
