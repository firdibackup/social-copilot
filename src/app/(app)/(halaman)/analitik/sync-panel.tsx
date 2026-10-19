'use client'

import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { refreshAnalytics, type RefreshResult } from './actions'

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50'

const UNREACHABLE: RefreshResult = { status: 'error', message: 'Gagal menghubungi server. Coba lagi.' }

interface SyncPanelProps {
  /** The page title and description, left of the button. */
  children: ReactNode
  canSync: boolean
  /** The data is over 6 hours old: sync once as the page opens. */
  shouldSyncNow: boolean
  /** e.g. "Terakhir sync 19 Oktober 2026 pukul 07.00 WIB: 12 post diperbarui, 0 gagal." */
  lastSync: string
}

/** The header with Refresh, and one line under it with what the last sync did. */
export function SyncPanel({ children, canSync, shouldSyncNow, lastSync }: SyncPanelProps) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<RefreshResult | null>(null)
  const hasAutoSynced = useRef(false)

  const sync = useCallback((isAuto: boolean) => {
    startTransition(async () => {
      const next = await refreshAnalytics().catch(() => UNREACHABLE)
      // The page's own sync stays quiet when another one just ran.
      if (!(isAuto && next.status === 'cooldown')) setResult(next)
    })
  }, [])

  useEffect(() => {
    if (!shouldSyncNow || hasAutoSynced.current) return
    hasAutoSynced.current = true
    sync(true)
  }, [shouldSyncNow, sync])

  const status = pending ? 'Menyinkronkan post dan insights dari Instagram…' : (result?.message ?? lastSync)
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        {children}
        <button type="button" onClick={() => sync(false)} disabled={!canSync || pending} className={BUTTON}>
          <RefreshCw size={16} aria-hidden="true" className={pending ? 'animate-spin' : undefined} />
          Refresh
        </button>
      </header>
      <p
        role={result?.status === 'error' ? 'alert' : 'status'}
        className={`rounded-lg border px-4 py-3 text-sm ${
          result?.status === 'error' && !pending
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-zinc-200 bg-white text-zinc-600'
        }`}
      >
        {status}
      </p>
    </div>
  )
}
