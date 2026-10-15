'use client'

import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Notice } from '@/components/notice'
import {
  AUDIENCE_MAX_LENGTH,
  GOALS,
  REWRITE_STYLES,
  TONES,
  TOPIC_MAX_LENGTH,
  type AiRequest,
  type AiResult,
  type AiTask,
  type Goal,
  type Tone,
} from '@/lib/ai-options'
import { generateAction } from './ai-actions'

/** Where each task's options land in the editor. */
const APPLY: Record<AiTask, { mode: 'replace' | 'append' | 'topic'; label: string }> = {
  captions: { mode: 'replace', label: 'Pakai caption ini' },
  ideas: { mode: 'topic', label: 'Jadikan topik' },
  rewrite: { mode: 'replace', label: 'Pakai caption ini' },
  hashtags: { mode: 'append', label: 'Tambahkan ke caption' },
}

const LEGEND = 'mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase'
const LABEL = 'block space-y-1 text-sm font-medium text-zinc-900'
const FIELD =
  'block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-400 focus:outline-none'
const PRIMARY_BUTTON =
  'rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50'
const BUTTON =
  'rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50'

const entries = <K extends string>(choices: Record<K, string>) => Object.entries(choices) as [K, string][]

/**
 * The panel renders inside the post form, but its fields belong to this empty form (rendered by PostEditor outside
 * the post form) through the `form` attribute. Otherwise Enter in Audiens would submit the post with Jadwalkan,
 * and the reset after a save would show the dropdowns' first options while state kept the owner's choice.
 */
export const AI_FORM_ID = 'asisten-ai'

interface AiAssistantProps {
  caption: string
  photoCount: number
  onCaptionChange: (caption: string) => void
}

export function AiAssistant({ caption, photoCount, onCaptionChange }: AiAssistantProps) {
  const [topic, setTopic] = useState('')
  const [goal, setGoal] = useState<Goal>('promosi')
  const [tone, setTone] = useState<Tone>('santai')
  const [audience, setAudience] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ task: AiTask; options: string[] } | null>(null)
  // Offered back while the caption is still exactly what the AI put there.
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null)

  const hasTopic = topic.trim() !== ''
  const hasCaption = caption.trim() !== ''
  const brief = { topic, goal, tone, audience, photoCount }

  async function run(request: AiRequest) {
    setPending(true)
    setError(null)
    const response: AiResult = await generateAction(request).catch(() => ({ error: 'Permintaan terputus. Coba lagi.' }))
    setPending(false)
    if ('error' in response) setError(response.error)
    else setResult({ task: request.task, options: response.options })
  }

  function apply(task: AiTask, option: string) {
    const { mode } = APPLY[task]
    if (mode === 'topic') {
      setTopic(option)
      return
    }
    const next = mode === 'append' && hasCaption ? `${caption.trimEnd()}\n\n${option}` : option
    setUndo({ before: caption, after: next })
    onCaptionChange(next)
  }

  function revert() {
    if (!undo) return
    onCaptionChange(undo.before)
    setUndo(null)
  }

  return (
    <details className="rounded-xl border border-zinc-200 bg-zinc-50">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-900">
        <Sparkles size={16} aria-hidden="true" />
        Asisten AI
      </summary>

      <div className="space-y-5 border-t border-zinc-200 p-4">
        <fieldset disabled={pending} className="space-y-3">
          <legend className={LEGEND}>Tulis baru</legend>
          <label className={LABEL}>
            Topik
            <textarea
              form={AI_FORM_ID}
              rows={2}
              maxLength={TOPIC_MAX_LENGTH}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Misalnya: promo kopi susu gula aren diskon 20% akhir pekan"
              className={FIELD}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={LABEL}>
              Tujuan
              <select
                form={AI_FORM_ID}
                value={goal}
                onChange={(event) => setGoal(event.target.value as Goal)}
                className={FIELD}
              >
                {entries(GOALS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Nada
              <select
                form={AI_FORM_ID}
                value={tone}
                onChange={(event) => setTone(event.target.value as Tone)}
                className={FIELD}
              >
                {entries(TONES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Audiens <span className="font-normal text-zinc-500">(opsional)</span>
              <input
                form={AI_FORM_ID}
                value={audience}
                maxLength={AUDIENCE_MAX_LENGTH}
                onChange={(event) => setAudience(event.target.value)}
                className={FIELD}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!hasTopic}
              onClick={() => run({ task: 'captions', brief })}
              className={PRIMARY_BUTTON}
            >
              Buat 3 caption
            </button>
            <button type="button" disabled={!hasTopic} onClick={() => run({ task: 'ideas', brief })} className={BUTTON}>
              Minta ide
            </button>
          </div>
        </fieldset>

        <fieldset disabled={pending || !hasCaption} className="space-y-2">
          <legend className={LEGEND}>Ubah caption</legend>
          <div className="flex flex-wrap gap-2">
            {entries(REWRITE_STYLES).map(([style, label]) => (
              <button key={style} type="button" onClick={() => run({ task: 'rewrite', style, caption })} className={BUTTON}>
                {label}
              </button>
            ))}
            <button type="button" onClick={() => run({ task: 'hashtags', caption })} className={BUTTON}>
              + Hashtag
            </button>
          </div>
          {!hasCaption && <p className="text-xs text-zinc-500">Tulis atau pilih caption dulu.</p>}
        </fieldset>

        <div className="space-y-3">
          <p aria-live="polite" className="text-sm text-zinc-600">
            {pending ? 'AI sedang menulis…' : ''}
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          {undo && caption === undo.after && (
            <p className="text-sm text-zinc-600">
              Caption diganti.{' '}
              <button type="button" onClick={revert} className="font-medium text-zinc-900 underline">
                Urungkan
              </button>
            </p>
          )}
          {result && (
            <ol aria-label="Hasil AI" className="space-y-3">
              {result.options.map((option) => (
                <li key={option} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
                  <p className="text-sm break-words whitespace-pre-wrap text-zinc-800">{option}</p>
                  <button type="button" onClick={() => apply(result.task, option)} className={BUTTON}>
                    {APPLY[result.task].label}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </details>
  )
}
