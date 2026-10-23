'use client'

import { Globe } from 'lucide-react'
import Link from 'next/link'
import { useActionState } from 'react'
import { importWebsiteAction, type WebsiteImportState } from './actions'
import { Feedback, INITIAL_STATE, PRIMARY_BUTTON } from './ui'

const INITIAL_IMPORT: WebsiteImportState = { ...INITIAL_STATE, pages: 0, imported: 0, duplicates: 0, warnings: [] }

/** Imports the photos of the website saved in Brand; the address itself is changed there. */
export function WebsiteCard({ websiteUrl, creditCost }: { websiteUrl: string; creditCost: number }) {
  const [state, action, pending] = useActionState(importWebsiteAction, INITIAL_IMPORT)
  const host = websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

  return (
    <section aria-labelledby="website-judul" className="rounded-xl border border-hairline bg-paper p-4">
      <h2 id="website-judul" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Globe size={16} aria-hidden="true" />
        Dari website
      </h2>
      {websiteUrl ? (
        <form action={action} className="mt-2 space-y-3">
          <input type="hidden" name="url" value={websiteUrl} />
          <p className="truncate text-sm text-ink" title={websiteUrl}>
            {host}
          </p>
          <p className="text-xs text-ink-muted">
            Membaca hingga 11 halaman, menyimpan maksimal 40 gambar, lalu AI mengelompokkannya per produk dan memberi tag.{' '}
            {creditCost} kredit per batch, hingga 12 gambar.
          </p>
          <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} w-full`}>
            {pending ? 'Membaca website…' : 'Ambil gambar'}
          </button>
          <div className="space-y-1" aria-live="polite">
            <Feedback state={state} />
            {state.success && state.error && (
              <p className="text-xs text-ink-muted">Gambar sudah masuk Aset. Pengelompokan bisa diatur sendiri lewat Produk.</p>
            )}
            {state.warnings.map((warning) => (
              <p key={warning} className="text-xs text-amber-700">
                {warning}
              </p>
            ))}
          </div>
          <Link href="/brand" className="inline-block text-xs font-medium text-accent hover:text-accent-deep">
            Ganti alamat di Brand
          </Link>
        </form>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          Isi alamat website di{' '}
          <Link href="/brand" className="font-medium text-accent hover:text-accent-deep">
            Brand
          </Link>{' '}
          untuk mengambil foto produk dari sana.
        </p>
      )}
    </section>
  )
}
