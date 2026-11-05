'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Check, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CancelGenerationButton } from '@/components/cancel-generation-button'
import { formatCreditShare } from '@/lib/billing-options'

/** Seconds into the one request at which each step starts; it is a single call, so the steps are an estimate. */
const STEP_AT = { read: 0, erase: 10, object: 35, finish: 45 }

export type MagicResult = { ok: true } | { error: string | null }

interface MagicLayersDialogProps {
  /** The slide's number, for the title. */
  slide: number
  /** Credits per slide; splitting the object costs a second unit. */
  rate: number
  planCredits: number
  /** Credits left in the period; null when unknown (the server still checks). */
  credits: number | null
  /** Free credits left on the trial; null for a paying user. */
  trial: number | null
  /** Runs Lapisan ajaib; `{ error: null }` means the page already answered (cancelled, upgrade or storage dialog). */
  onRun: (splitObject: boolean) => Promise<MagicResult>
  onCancelRun: () => void
  cancelling: boolean
  onClose: () => void
}

/** ✨ Lapisan ajaib: what it does and costs, then its progress while the one request runs. */
export function MagicLayersDialog({ slide, rate, planCredits, credits, trial, onRun, onCancelRun, cancelling, onClose }: MagicLayersDialogProps) {
  const t = useTranslations('editor.layerEditor')
  const locale = useLocale()
  const dialog = useRef<HTMLDialogElement>(null)
  const [splitObject, setSplitObject] = useState(false)
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

  const cost = rate * (splitObject ? 2 : 1)
  const short = credits !== null && cost > credits
  const steps = [
    { key: 'read', at: STEP_AT.read, label: t('magic.stepRead') },
    { key: 'erase', at: STEP_AT.erase, label: t('magic.stepErase') },
    ...(splitObject ? [{ key: 'object', at: STEP_AT.object, label: t('magic.stepObject') }] : []),
    { key: 'finish', at: splitObject ? STEP_AT.finish + 20 : STEP_AT.finish, label: t('magic.stepFinish') },
  ]
  const current = steps.reduce((index, step, at) => (elapsed >= step.at ? at : index), 0)

  async function run() {
    setError(null)
    setElapsed(0)
    setRunning(true)
    const result = await onRun(splitObject)
    setRunning(false)
    if ('error' in result) {
      if (result.error) setError(result.error)
      else onClose()
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="magic-heading"
      onCancel={(event) => {
        event.preventDefault()
        if (!running) onClose()
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] overflow-visible rounded-2xl bg-transparent p-0 text-ink backdrop:bg-[rgba(20,21,31,0.36)] backdrop:backdrop-blur-[3px]"
    >
      <div className="animate-modal-in overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_24px_60px_-12px_rgb(20_21_31/0.28),0_2px_6px_rgb(20_21_31/0.06)]">
        <div className="relative overflow-hidden bg-[radial-gradient(120%_90%_at_0%_0%,var(--color-lavender)_0%,transparent_60%),radial-gradient(90%_80%_at_100%_0%,color-mix(in_srgb,var(--color-mint)_60%,transparent)_0%,transparent_65%)] px-5 pt-5 pb-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-accent shadow-[0_1px_3px_-1px_rgba(0,0,0,0.2)]">
              <Sparkles size={20} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id="magic-heading" className="text-lg leading-snug font-semibold text-ink">
                {t('magic.title', { slide })}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('magic.description')}</p>
            </div>
            {!running && (
              <button type="button" aria-label={t('close')} onClick={onClose} className="-mt-1 -mr-1 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/70 hover:text-zinc-900">
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4 px-5 pt-4 pb-5 sm:px-6">
          {running ? (
            <ol aria-label={t('magic.progress')} className="space-y-2.5" role="status">
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
                    <span className={state === 'next' ? 'text-ink-soft' : state === 'active' ? 'font-medium text-ink' : 'text-ink-muted'}>
                      {step.label}
                    </span>
                    {state === 'active' && <span aria-hidden="true" className="ml-auto h-1 w-10 overflow-hidden rounded-full bg-accent-soft"><span className="block h-full w-1/2 animate-sweep rounded-full bg-accent" /></span>}
                  </li>
                )
              })}
              <li className="pt-1 text-xs text-ink-muted">{t('magic.wait')}</li>
            </ol>
          ) : (
            <>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-zinc-50 has-checked:border-accent/50 has-checked:bg-accent-soft/40">
                <input
                  type="checkbox"
                  checked={splitObject}
                  onChange={(event) => setSplitObject(event.target.checked)}
                  className="mt-0.5 size-4 accent-accent"
                />
                <span className="min-w-0 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    {t('magic.splitObject')}
                    <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold tracking-wide text-amber-800 uppercase">beta</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{t('magic.splitHint')}</span>
                </span>
              </label>
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-muted">{t('magic.costLabel')}</span>
                <span className="font-semibold text-ink tabular-nums">
                  {t('magic.cost', { share: formatCreditShare(cost, planCredits, locale) })}
                  {splitObject && <span className="ml-1 text-xs font-normal text-ink-muted">(×2)</span>}
                </span>
              </p>
              {trial !== null && <p className="text-xs text-ink-muted">{t('magic.notInTrial')}</p>}
              {short && trial === null && <p role="alert" className="text-xs text-red-700">{t('magic.short')}</p>}
            </>
          )}

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {running ? (
              <CancelGenerationButton pending={cancelling} label={t('magic.cancel')} onClick={onCancelRun} />
            ) : (
              <>
                <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-hairline bg-white px-4 text-sm font-semibold text-ink transition-colors hover:bg-zinc-50 sm:min-h-10">
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={short && trial === null}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_1px_2px_rgb(20_21_31/0.12)] transition-colors hover:bg-accent-deep disabled:bg-zinc-300 sm:min-h-10"
                >
                  <Sparkles size={15} aria-hidden="true" />
                  {error ? t('magic.retry') : t('magic.run')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </dialog>
  )
}
