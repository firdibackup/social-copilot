'use client'

import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { subscribeAction } from './actions'

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50'

/** New DMs arrive through the webhook while the page is open; this fetches them. */
export function RefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button type="button" onClick={() => startTransition(() => router.refresh())} disabled={pending} className={BUTTON}>
      <RefreshCw size={16} aria-hidden="true" className={pending ? 'animate-spin' : undefined} />
      Muat ulang
    </button>
  )
}

export function SubscribeButton() {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function subscribe() {
    setPending(true)
    const error = await subscribeAction().catch(() => 'Gagal menghubungi server. Coba lagi.')
    setPending(false)
    setResult(error ? { ok: false, message: error } : { ok: true, message: 'Pengiriman DM aktif untuk akun ini.' })
  }

  return (
    <div className="space-y-1">
      <button type="button" onClick={subscribe} disabled={pending} className={BUTTON}>
        {pending ? 'Mengaktifkan…' : 'Aktifkan DM'}
      </button>
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'text-emerald-700' : 'text-red-700'}>
          {result.message}
        </p>
      )}
    </div>
  )
}
