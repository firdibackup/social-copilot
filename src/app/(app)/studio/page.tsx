import type { Metadata } from 'next'
import Link from 'next/link'
import { ImageGenerator } from '@/components/image-generator'

export const metadata: Metadata = { title: 'Studio' }

/** Stock images for later posts. The post editor has the same generator, saving straight into the post. */
export default function StudioPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <header className="max-w-2xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Studio</h1>
        <p className="text-zinc-500">
          Buat gambar atau carousel dengan AI memakai gaya, palet, dan font dari{' '}
          <Link href="/brand" className="font-medium text-zinc-900 underline">
            brand kit
          </Link>
          . Gambar yang kamu simpan masuk ke{' '}
          <Link href="/aset" className="font-medium text-zinc-900 underline">
            Aset
          </Link>{' '}
          dan bisa dipakai di post mana pun.
        </p>
      </header>
      <ImageGenerator room={10} saveLabel="Simpan ke Aset" />
    </div>
  )
}
