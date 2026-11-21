'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Check, Image as ImageIcon, Scissors, Wallpaper, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CancelGenerationButton } from '@/components/cancel-generation-button'
import { formatCreditShare, OBJECT_SPLIT_UNITS } from '@/lib/billing-options'
import { layerImageUrl } from '@/lib/layer-doc'

/** Seconds into the one request at which each step starts; it is a single call, so the steps are an estimate. */
const STEP_AT = { find: 0, cut: 12, fill: 28 }

export type SplitSource = 'background' | 'layer'
/** `{ error: null }`: the editor already answered (cancelled, upgrade or storage dialog). */
export type SplitRun = { ok: true } | { error: string | null }

interface SplitObjectDialogProps {
  /** The slide's background, for the "Latar belakang" preview. */
  backgroundAssetId: string
  /** The background was already swapped by an unsaved split: the server would split the old one, so save first. */
  backgroundLocked: boolean
  /** The selected image layer's picture, or null when no image layer is selected. */
  layerAssetId: string | null
  /** Credits per unit of magic_layers. */
  rate: number
  planCredits: number
  /** Credits left in the period; null when unknown (the server still checks). */
  credits: number | null
  /** Free credits left on the trial; null for a paying user. */
  trial: number | null
  onRun: (source: SplitSource) => Promise<SplitRun>
  onCancelRun: () => void
  cancelling: boolean
  onClose: () => void
}

/**
 * Pisahkan objek: take the main subject out of the slide's background or the selected picture, as its own layer.
 * What it costs, then its progress while the one request runs.
 */
export function SplitObjectDialog({
  backgroundAssetId, backgroundLocked, layerAssetId, rate, planCredits, credits, trial, onRun, onCancelRun, cancelling, onClose,
}: SplitObjectDialogProps) {
  const t = useTranslations('editor.layerEditor')
  const locale = useLocale()
  const dialog = useRef<HTMLDialogElement>(null)
  const [source, setSource] = useState<SplitSource | null>(layerAssetId ? 'layer' : backgroundLocked ? null : 'background')
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const node = dialog.current
    if (node && !node.open) node.showModal()
  }, [])

  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 500)
    return () => window.clearInterval(timer)
  }, [running])

  const cost = rate * OBJECT_SPLIT_UNITS
  const short = credits !== null && cost > credits
  const steps = [
    { key: 'find', at: STEP_AT.find, label: t('split.stepFind') },
    { key: 'cut', at: STEP_AT.cut, label: t('split.stepCut') },
    { key: 'fill', at: STEP_AT.fill, label: t('split.stepFill') },
  ]
  const current = steps.reduce((index, step, at) => (elapsed >= step.at ? at : index), 0)

  async function run() {
    setError(null)
    setElapsed(0)
    if (!source) return
    setRunning(true)
    const result = await onRun(source)
    setRunning(false)
    if ('error' in result) {
      if (result.error) setError(result.error)
      else onClose()
    }
  }

  const options = [
    { value: 'background' as const, icon: Wallpaper, label: t('split.background'), hint: backgroundLocked ? t('split.backgroundSaveFirst') : t('split.backgroundHint'), assetId: backgroundAssetId, disabled: backgroundLocked },
    { value: 'layer' as const, icon: ImageIcon, label: t('split.layer'), hint: layerAssetId ? t('split.layerHintOn') : t('split.layerHint'), assetId: layerAssetId, disabled: !layerAssetId },
  ]

  return (
    <dialog
      ref={dialog}
      aria-labelledby="split-heading"
      aria-describedby="split-description"
      onCancel={(event) => {
        // The editor's own Esc chain must not see this one.
        event.preventDefault()
        event.stopPropagation()
        if (!running) onClose()
      }}
      // Keys typed here aren't the editor's shortcuts.
      onKeyDown={(event) => event.stopPropagation()}
      className="m-auto w-[min(28rem,calc(100%-2rem))] overflow-visible rounded-2xl bg-transparent p-0 text-ink backdrop:bg-[rgba(20,21,31,0.36)] backdrop:backdrop-blur-[3px]"
    >
      <div className="animate-modal-in overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_24px_60px_-12px_rgb(20_21_31/0.28),0_2px_6px_rgb(20_21_31/0.06)]">
        <div className="relative overflow-hidden bg-[radial-gradient(120%_90%_at_0%_0%,var(--color-lavender)_0%,transparent_60%),radial-gradient(90%_80%_at_100%_0%,color-mix(in_srgb,var(--color-mint)_60%,transparent)_0%,transparent_65%)] px-5 pt-5 pb-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-accent shadow-[0_1px_3px_-1px_rgba(0,0,0,0.2)]">
              <Scissors size={20} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id="split-heading" className="flex items-center gap-2 text-lg leading-snug font-semibold text-ink">
                {t('split.title')}
                <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold tracking-wide text-amber-800 uppercase">beta</span>
              </h2>
              <p id="split-description" className="mt-1 text-sm leading-relaxed text-ink-muted">{t('split.description')}</p>
            </div>
            {!running && (
              <button type="button" aria-label={t('split.close')} onClick={onClose} className="-mt-1 -mr-1 inline-flex size-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/70 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent">
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4 px-5 pt-4 pb-5 sm:px-6">
          {running ? (
            <ol aria-label={t('split.progress')} className="space-y-2.5" role="status">
              {steps.map((step, index) => {
                const state = index < current ? 'done' : index === current ? 'active' : 'next'
                return (
                  <li key={step.key} className="flex items-center gap-3 text-sm">
                    <span
                      aria-hidden="true"
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                        state === 'done' ? 'bg-accent text-white' : state === 'active' ? 'bg-accent-soft text-accent ring-4 ring-accent-soft/50' : 'bg-zinc-100 text-ink-soft'
                      }`}
                    >
                      {state === 'done' ? <Check size={13} strokeWidth={3} /> : index + 1}
                    </span>
                    <span className={state === 'next' ? 'text-ink-soft' : state === 'active' ? 'font-medium text-ink' : 'text-ink-muted'}>{step.label}</span>
                    {state === 'active' && <span aria-hidden="true" className="ml-auto h-1 w-10 overflow-hidden rounded-full bg-accent-soft"><span className="block h-full w-1/2 animate-sweep rounded-full bg-accent" /></span>}
                  </li>
                )
              })}
              <li className="pt-1 text-xs text-ink-muted">{t('split.wait')}</li>
            </ol>
          ) : (
            <>
              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="mb-2 text-xs font-medium text-ink-muted">{t('split.source')}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {options.map(({ value, icon: Icon, label, hint, assetId, disabled }) => (
                    <label
                      key={value}
                      className={`group relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border bg-white transition-[border-color,box-shadow] has-checked:border-accent has-checked:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_18%,transparent)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${
                        disabled ? 'cursor-not-allowed border-dashed border-zinc-300 opacity-60' : 'border-hairline hover:border-accent/50'}`}
                    >
                      <input type="radio" name="split-source" value={value} checked={source === value} disabled={disabled}
                        onChange={() => setSource(value)} className="sr-only" />
                      <span aria-hidden="true" className="relative block aspect-[4/3] overflow-hidden bg-[conic-gradient(#e4e4e7_25%,transparent_0_50%,#e4e4e7_0_75%,transparent_0)] bg-[length:12px_12px]">
                        {assetId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={layerImageUrl(assetId)} alt="" draggable={false} className="absolute inset-0 size-full object-contain" />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center bg-zinc-50 text-ink-soft"><Icon size={22} /></span>
                        )}
                        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full border-2 border-white bg-white/80 shadow-[0_1px_3px_rgba(23,24,39,0.3)] group-has-checked:bg-accent">
                          <Check size={11} strokeWidth={3.5} className="text-white opacity-0 group-has-checked:opacity-100" />
                        </span>
                      </span>
                      <span className="block min-w-0 px-2.5 py-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Icon size={14} aria-hidden="true" className="shrink-0 text-ink-muted group-has-checked:text-accent" /><span className="truncate">{label}</span></span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-muted">{t('split.costLabel')}</span>
                <span className="font-semibold text-ink tabular-nums">
                  {t('split.cost', { share: formatCreditShare(cost, planCredits, locale) })}
                  <span className="ml-1 text-xs font-normal text-ink-muted">(×{OBJECT_SPLIT_UNITS})</span>
                </span>
              </p>
              {trial !== null && <p className="text-xs text-ink-muted">{t('split.notInTrial')}</p>}
              {short && trial === null && <p role="alert" className="text-xs text-red-700">{t('split.short')}</p>}
              {source === 'background' && <p className="text-[11px] leading-relaxed text-ink-soft">{t('split.undoNote')}</p>}
            </>
          )}

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {running ? (
              <CancelGenerationButton pending={cancelling} label={t('split.cancel')} onClick={onCancelRun} />
            ) : (
              <>
                <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-hairline bg-white px-4 text-sm font-semibold text-ink transition-colors hover:bg-zinc-50 sm:min-h-10">
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void run()}
                  // The trial can still try: the server answers with the upgrade dialog.
                  disabled={!source || (short && trial === null)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_1px_2px_rgb(20_21_31/0.12)] transition-colors hover:bg-accent-deep disabled:bg-zinc-300 sm:min-h-10"
                >
                  <Scissors size={15} aria-hidden="true" />
                  {error ? t('split.retry') : t('split.run')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </dialog>
  )
}
