import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Notice } from '@/components/notice'
import { requireAccount } from '@/lib/auth'
import { getBrandKit, listReferences, VISUAL_REFERENCE_LIMIT } from '@/lib/brand'
import { getConnection } from '@/lib/connection'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { getFacebookConnection } from '@/lib/facebook-connection'
import { BrandForm } from './brand-form'
import { ReferencesPanel } from './references-panel'
import { StrategyCard } from './strategy-card'
import { SyncRefresher } from './sync-refresher'

export const metadata: Metadata = { title: 'Brand' }

export default function BrandPage() {
  return (
    <div className="max-w-5xl space-y-8">
      <header className="max-w-2xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Brand</h1>
        <p className="text-zinc-500">
          Identitas, gaya bahasa, dan gaya visual brand. Buat AI memakai teksnya di setiap caption; palet, logo, dan
          referensi disiapkan untuk desain. Hasil analisis AI hanya mengisi form, jadi periksa dulu lalu tekan Simpan.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-500">Memuat brand kit…</p>}>
        <BrandStudio />
      </Suspense>
    </div>
  )
}

async function BrandStudio() {
  await connection()
  const { userId, accountId } = await requireAccount()
  let data
  try {
    const [kit, references, instagram, facebook] = await Promise.all([
      getBrandKit(userId, accountId),
      listReferences(userId, accountId),
      getConnection(userId),
      getFacebookConnection(userId, accountId),
    ])
    data = { kit, references, instagram, facebook }
  } catch (error) {
    console.error('[brand] gagal memuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  const instagramUsername = data.instagram?.status === 'active' ? data.instagram.username : null
  const syncing = data.kit.syncStatus
  return (
    <div className="space-y-10">
      {syncing === 'running' && (
        <Notice tone="success">
          Menyiapkan brand dari @{data.instagram?.username ?? 'akun'}… Profil, logo, warna, dan referensi desain terisi
          sendiri dalam beberapa saat.
          <SyncRefresher />
        </Notice>
      )}
      {syncing === 'failed' && (
        <Notice tone="warning">
          Sebagian brand gagal disiapkan otomatis. Lengkapi lewat tombol analisis di bawah.
        </Notice>
      )}
      <StrategyCard strategy={data.kit.strategy} syncing={syncing === 'running'} />
      {/* The form copies the kit into state once: remount it when the fill finishes, or it keeps the empty kit. */}
      <BrandForm
        key={syncing ?? 'siap'}
        kit={data.kit}
        references={data.references}
        instagramUsername={instagramUsername}
        visualLimit={VISUAL_REFERENCE_LIMIT}
      />
      <ReferencesPanel
        references={data.references}
        instagramUsername={instagramUsername}
        discoveryReady={data.facebook?.status === 'active'}
      />
    </div>
  )
}
