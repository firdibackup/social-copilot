'use client'

import { useTranslations } from 'next-intl'

import { BrushCleaning, Check, ImageOff, LoaderCircle, RotateCw, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { confirmDialog } from '@/components/confirm-dialog'
import { MediaImage } from '@/components/media-image'
import type { Asset } from '@/lib/assets'
import { deleteAssetsAction, storageCleanupAction } from './actions'
import { Feedback, SECONDARY_BUTTON, useAssetAction } from './ui'

const DELETE_BUTTON =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_1px_2px_rgb(20_21_31/0.12)] hover:bg-red-700 disabled:opacity-60'

type Suggestions = { assets: Asset[] } | { error: string } | null

interface CleanupPanelProps {
  onClose: () => void
  /** Sends the owner to their own photos, to clean those up by hand. */
  onShowMine: () => void
}

/**
 * Suggests AI images that no post, thread or slide uses, all preselected, so freeing room is one tap. The owner's own
 * photos are never suggested: only they know which ones they still need.
 */
export function CleanupPanel({ onClose, onShowMine }: CleanupPanelProps) {
  const t = useTranslations('assets')
  const [round, setRound] = useState(0)
  const [suggestions, setSuggestions] = useState<Suggestions>(null)
  // What the owner unticked; everything else suggested stays picked, including suggestions that arrive later.
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set())
  const action = useAssetAction()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  useEffect(() => {
    let active = true
    storageCleanupAction()
      .catch(() => ({ error: t('cleanupPanel.text1') }))
      .then((result) => {
        if (active) setSuggestions(result)
      })
    return () => {
      active = false
    }
  }, [round, t])

  // The server loads the suggestions itself (the library holds only the newest AI results); own photos never pass.
  const candidates = suggestions && 'assets' in suggestions ? suggestions.assets.filter((asset) => asset.origin === 'ai') : []
  const picked = candidates.filter((asset) => !kept.has(asset.id)).map((asset) => asset.id)
  const allPicked = picked.length === candidates.length

  function toggle(id: string) {
    setKept((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function remove() {
    const ok = await confirmDialog({
      title: picked.length === 1 ? t('cleanupPanel.text2') : t('cleanupPanel.text3', { v0: picked.length }),
      description: t('cleanupPanel.text4'),
      confirmLabel: t('cleanupPanel.text5'),
      tone: 'danger',
    })
    if (!ok) return
    // Look again afterwards: older unused images may surface once these are gone.
    action.run(deleteAssetsAction, { id: picked }, () => setRound((value) => value + 1))
  }

  const loading = suggestions === null || (action.pending && candidates.length === 0)

  return (
    <section
      aria-labelledby="bersihkan-judul"
      className="relative animate-fade-in overflow-hidden rounded-2xl border border-accent/25 bg-paper shadow-[0_1px_2px_rgb(20_21_31/0.04),0_12px_32px_-16px_rgb(101_88_245/0.25)]"
    >
      {/* A soft wash of the accent in the corner, so the panel reads as a moment apart from the library below. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-accent-soft opacity-70 blur-3xl"
      />
      <div className="relative space-y-4 p-4 sm:p-5">
        <header className="flex items-start gap-3 sm:gap-4">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent ring-8 ring-accent-soft/40"
          >
            <BrushCleaning size={20} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1 space-y-1 pt-0.5">
            <h2
              id="bersihkan-judul"
              ref={heading}
              tabIndex={-1}
              className="text-lg leading-snug font-semibold text-ink outline-none"
            >
              {t('cleanupPanel.text6')}</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-pretty text-ink-muted">
              {t('cleanupPanel.text7')}<span className="font-medium text-ink">{t('cleanupPanel.text8')}</span>{t('cleanupPanel.text9')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('cleanupPanel.text10')}
            className="-mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-zinc-100 hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {loading ? (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-ink-muted">
            <LoaderCircle size={16} className="animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
            {t('cleanupPanel.text11')}</p>
        ) : suggestions && 'error' in suggestions ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span role="alert">{suggestions.error}</span>
            <button
              type="button"
              onClick={() => {
                setSuggestions(null)
                setRound((value) => value + 1)
              }}
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              <RotateCw size={14} aria-hidden="true" />
              {t('cleanupPanel.text12')}</button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-5 sm:flex-row sm:items-center">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-ink-muted ring-1 ring-hairline">
              <ImageOff size={18} />
            </span>
            <div className="min-w-0 flex-1 space-y-0.5 text-sm">
              <p className="font-medium text-ink">{t('cleanupPanel.text13')}</p>
              <p className="text-ink-muted">
                {t('cleanupPanel.text14')}</p>
              {action.state.success && <Feedback state={action.state} />}
            </div>
            <button type="button" onClick={onShowMine} className={`${SECONDARY_BUTTON} shrink-0`}>
              {t('cleanupPanel.text15')}</button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Sparkles size={14} className="text-accent" aria-hidden="true" />
                {t('cleanupPanel.selected', { count: picked.length, total: candidates.length })}</span>
              <button
                type="button"
                onClick={() => setKept(allPicked ? new Set(candidates.map((asset) => asset.id)) : new Set())}
                className="rounded-md px-1.5 py-0.5 text-sm font-medium text-accent hover:bg-accent-soft"
              >
                {allPicked ? t('cleanupPanel.text18') : t('cleanupPanel.text19')}
              </button>
              <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} flex-1 sm:flex-none`}>
                  {t('cleanupPanel.text20')}</button>
                <button
                  type="button"
                  disabled={action.pending || picked.length === 0}
                  onClick={remove}
                  className={`${DELETE_BUTTON} flex-1 sm:flex-none`}
                >
                  {action.pending ? (
                    <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <Trash2 size={14} aria-hidden="true" />
                  )}
                  {action.pending ? t('cleanupPanel.text21') : picked.length === 0 ? t('cleanupPanel.text5') : t('cleanupPanel.text22', { v0: picked.length })}
                </button>
              </div>
            </div>
            <div aria-live="polite">
              <Feedback state={action.state} />
            </div>
            <ul className="grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {candidates.map((asset) => {
                const checked = !kept.has(asset.id)
                return (
                  <li key={asset.id} className="min-w-0">
                    <label
                      className={`group/tile relative block cursor-pointer overflow-hidden rounded-lg bg-zinc-100 ring-2 transition-[box-shadow,opacity] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${
                        checked ? 'ring-red-500/80' : 'ring-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(asset.id)}
                        disabled={action.pending}
                        className="sr-only"
                      />
                      <MediaImage
                        src={asset.url}
                        className={`aspect-square w-full object-cover transition-[opacity,filter] ${checked ? '' : 'opacity-90 group-hover/tile:opacity-100'}`}
                      />
                      {checked && <span aria-hidden="true" className="absolute inset-0 bg-red-950/15" />}
                      <span
                        aria-hidden="true"
                        className={`absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-md border transition-colors ${
                          checked ? 'border-red-600 bg-red-600 text-white' : 'border-white/90 bg-zinc-950/30 text-transparent'
                        }`}
                      >
                        <Check size={14} strokeWidth={2.6} />
                      </span>
                      {!checked && (
                        <span className="absolute right-1.5 bottom-1.5 rounded bg-zinc-950/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
                          {t('cleanupPanel.text23')}</span>
                      )}
                      <span className="sr-only">{checked ? t('cleanupPanel.text24') : t('cleanupPanel.text23')}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
