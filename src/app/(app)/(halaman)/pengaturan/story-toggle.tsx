'use client'

import { useState, useTransition } from 'react'
import { Notice } from '@/components/notice'
import { applyStoryToScheduledAction, setStoryDefaultAction } from './actions'

const FAILED = 'Gagal menghubungi server. Coba lagi.'

type Offer = { kind: 'apply'; count: number } | { kind: 'applied'; count: number } | null

/** The switch saves on its own. Switched on with posts already scheduled, it offers to apply to those too. */
export function StoryToggle({ initialEnabled, connected }: { initialEnabled: boolean; connected: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [offer, setOffer] = useState<Offer>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !enabled
    setEnabled(next)
    setError(null)
    setOffer(null)
    startTransition(async () => {
      const result = await setStoryDefaultAction(next).catch(() => ({ error: FAILED }))
      if ('error' in result) {
        setEnabled(!next)
        setError(result.error)
      } else if (result.scheduled > 0) {
        setOffer({ kind: 'apply', count: result.scheduled })
      }
    })
  }

  function apply() {
    setError(null)
    startTransition(async () => {
      const result = await applyStoryToScheduledAction().catch(() => ({ error: FAILED }))
      if ('error' in result) setError(result.error)
      else setOffer({ kind: 'applied', count: result.applied })
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="story-heading" className="text-xs font-semibold tracking-wider text-zinc-900 uppercase">
            Selalu bagikan ke Story
          </h2>
          <p className="text-sm text-zinc-500">
            {connected
              ? 'Setiap post Instagram baru otomatis ikut diposting ke Story. Masih bisa dimatikan per post.'
              : 'Hubungkan Instagram dulu.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Selalu bagikan ke Story"
          disabled={!connected || pending}
          onClick={toggle}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-accent' : 'bg-zinc-300'}`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`}
          />
        </button>
      </div>
      {offer?.kind === 'apply' && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"
        >
          <span className="min-w-0 flex-1">
            Berlaku untuk post baru. Terapkan juga ke {offer.count} post terjadwal?
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffer(null)}
              disabled={pending}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-60"
            >
              Nanti saja
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={pending}
              className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-60"
            >
              {pending ? 'Menerapkan…' : 'Terapkan'}
            </button>
          </span>
        </div>
      )}
      {offer?.kind === 'applied' && (
        <Notice tone="success">
          {offer.count > 0 ? `Story dinyalakan untuk ${offer.count} post terjadwal.` : 'Semua post terjadwal sudah ikut ke Story.'}
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
