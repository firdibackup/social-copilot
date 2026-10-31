'use client'

import { useTranslations, useLocale } from 'next-intl'

import { ArrowDown, ArrowUp, Equal, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { confirmDialog } from '@/components/confirm-dialog'
import { Notice } from '@/components/notice'
import {
  DEFAULT_POSTS_PER_WEEK,
  evenShares,
  FOCUS_LABELS,
  isFocus,
  MAX_PILLARS,
  MAX_POSTS_PER_WEEK,
  MIN_PILLARS,
  MIN_POSTS_PER_WEEK,
  MIN_SHARE,
  newPillarId,
  parseStrategy,
  STRATEGY_LIMITS,
  totalShare,
  type ContentPillar,
  type ContentStrategy,
  type StrategyFocus,
} from '@/lib/strategy-options'
import { generateStrategyAction, saveStrategyAction } from './actions'
import { BUTTON, CARD, FIELD, LABEL, PRIMARY_BUTTON } from './brand-form'

/** Fields the AI filled that the owner hasn't saved yet (same marker as the brand form). */
const SUGGESTED = 'border-amber-300 bg-amber-50/40'
const ICON_BUTTON =
  'inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus)] disabled:pointer-events-none disabled:opacity-40'
/** One shade per pillar for the stacked preview, darkest first. */
const SHADES = ['bg-accent', 'bg-accent/75', 'bg-accent/55', 'bg-accent/40', 'bg-accent/28', 'bg-accent/18']

/** Keys of the AI-filled marker: the top fields, or `pillar:<id>`. */
type Mark = 'identity' | 'tone' | 'focus' | 'postsPerWeek' | `pillar:${string}`

interface StrategyCardProps {
  strategy: ContentStrategy | null
  syncing: boolean
}

/** The saved strategy seeds local state once: remount when the server sends a different one. */
export function StrategyCard({ strategy, syncing }: StrategyCardProps) {
  return <StrategyCardBody key={strategy ? JSON.stringify(strategy) : 'kosong'} strategy={strategy} syncing={syncing} />
}

function blankStrategy(): ContentStrategy {
  return {
    identity: '',
    pillars: evenShares(3).map((share) => ({ id: newPillarId(), name: '', detail: '', share })),
    tone: '',
    focus: 'awareness',
    postsPerWeek: DEFAULT_POSTS_PER_WEEK,
  }
}

const allMarks = (strategy: ContentStrategy): Set<Mark> =>
  new Set<Mark>(['identity', 'tone', 'focus', 'postsPerWeek', ...strategy.pillars.map((pillar) => `pillar:${pillar.id}` as const)])

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function StrategyCardBody({ strategy, syncing }: StrategyCardProps) {
  const t = useTranslations('brand')
  const [saved, setSaved] = useState<ContentStrategy | null>(strategy)
  const [draft, setDraft] = useState<ContentStrategy | null>(null)
  const [marks, setMarks] = useState<ReadonlySet<Mark>>(new Set())
  const [edited, setEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const busy = saving || generating

  function openEditor(next: ContentStrategy, fromAi: boolean) {
    setDraft(next)
    setMarks(fromAi ? allMarks(next) : new Set())
    setEdited(false)
    setError(null)
  }

  function close() {
    setDraft(null)
    setMarks(new Set())
    setEdited(false)
    setError(null)
    setWarnings([])
  }

  async function generate() {
    if (draft && edited && !(await confirmDialog({
      title: t('strategyCard.text1'),
      description: t('strategyCard.text2'),
      confirmLabel: t('strategyCard.text3'),
      tone: 'danger',
    }))) return
    setGenerating(true)
    setError(null)
    setWarnings([])
    const result = await generateStrategyAction().catch(() => ({ error: t('shared.failed') }))
    setGenerating(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    openEditor(result.strategy, true)
    setWarnings(result.warnings)
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    setError(null)
    const failure = await saveStrategyAction(draft).catch(() => t('shared.failed'))
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    const parsed = parseStrategy(draft)
    setSaved('strategy' in parsed ? parsed.strategy : draft)
    close()
  }

  return (
    <section className={`${CARD} relative overflow-hidden`} aria-labelledby="strategi-konten-judul">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-accent via-accent/60 to-transparent" />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl space-y-1">
          <h2 id="strategi-konten-judul" className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            {t('strategyCard.text4')}</h2>
          <p className="text-sm text-zinc-500">
            {t('strategyCard.text5')}</p>
        </div>
        {saved && !draft && (
          <button type="button" onClick={() => openEditor(saved, false)} className={BUTTON}>
            <Pencil size={14} aria-hidden="true" />
            {t('strategyCard.text6')}</button>
        )}
      </header>

      {draft ? (
        <StrategyEditor
          draft={draft}
          saved={saved}
          marks={marks}
          saving={saving}
          generating={generating}
          error={error}
          warnings={warnings}
          onChange={(next, touched) => {
            setDraft(next)
            setEdited(true)
            setError(null)
            if (touched) setMarks((previous) => new Set([...previous].filter((mark) => !touched.includes(mark))))
          }}
          onGenerate={generate}
          onSave={save}
          onCancel={close}
        />
      ) : saved ? (
        <StrategyView strategy={saved} />
      ) : syncing ? (
        <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500" role="status">
          <Sparkles size={14} aria-hidden="true" className="mr-1.5 inline animate-pulse text-accent" />
          {t('strategyCard.text7')}</p>
      ) : (
        <div className="space-y-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5">
          <p className="max-w-xl text-sm text-zinc-600">
            {t('strategyCard.text8')}</p>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={generate} disabled={busy} className={PRIMARY_BUTTON}>
              <Sparkles size={14} aria-hidden="true" />
              {generating ? t('strategyCard.text9') : t('strategyCard.text10')}
            </button>
            <button type="button" onClick={() => openEditor(blankStrategy(), false)} disabled={busy} className={BUTTON}>
              {t('strategyCard.text11')}</button>
            <span className="text-xs text-zinc-500">{t('strategyCard.text12')}</span>
          </div>
        </div>
      )}
    </section>
  )
}

function StrategyView({ strategy }: { strategy: ContentStrategy }) {
  const t = useTranslations('brand')
  return (
    <div className="space-y-6 rounded-xl border border-zinc-200 bg-zinc-50/70 p-5">
      <div className="space-y-1">
        <p className="text-xs text-zinc-500">{t('strategyCard.text13')}</p>
        <p className="text-2xl font-semibold tracking-tight text-zinc-900">{strategy.identity}</p>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-zinc-500">{t('strategyCard.text14')}</p>
        <ul className="space-y-3">
          {strategy.pillars.map((pillar) => (
            <li
              key={pillar.id}
              className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-center sm:gap-5"
            >
              <ShareBar share={pillar.share} />
              <p className="flex gap-3 text-sm text-zinc-800">
                <span className="w-9 shrink-0 text-right tabular-nums text-zinc-500">{pillar.share}%</span>
                <span className="min-w-0">
                  <span className="font-medium text-zinc-900">{pillar.name}</span>
                  {pillar.detail && <span className="text-zinc-500"> ({pillar.detail})</span>}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </div>

      <dl className="grid gap-4 border-t border-zinc-200 pt-4 sm:grid-cols-3">
        <Stat label={t('strategyCard.text15')}>{strategy.tone || '—'}</Stat>
        <Stat label={t('strategyCard.text16')}>{t(`focus.${strategy.focus}`)}</Stat>
        <Stat label={t('strategyCard.text17')}>{t('strategyCard.text18', { v0: strategy.postsPerWeek })}</Stat>
      </dl>
    </div>
  )
}

function ShareBar({ share }: { share: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-accent/10" aria-hidden="true">
      <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${clamp(share, 0, 100)}%` }} />
    </div>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium text-zinc-900">{children}</dd>
    </div>
  )
}

interface EditorProps {
  draft: ContentStrategy
  saved: ContentStrategy | null
  marks: ReadonlySet<Mark>
  saving: boolean
  generating: boolean
  error: string | null
  warnings: string[]
  onChange: (next: ContentStrategy, touched?: Mark[]) => void
  onGenerate: () => void
  onSave: () => void
  onCancel: () => void
}

function StrategyEditor({ draft, saved, marks, saving, generating, error, warnings, onChange, onGenerate, onSave, onCancel }: EditorProps) {
  const locale = useLocale()
  const t = useTranslations('brand')
  const { pillars } = draft
  const total = totalShare(pillars)
  const gap = 100 - total
  const parsed = parseStrategy(draft, locale)
  const invalid = 'error' in parsed ? parsed.error : null
  const dirty = !saved || JSON.stringify(draft) !== JSON.stringify(saved)
  const busy = saving || generating

  const set = <K extends keyof ContentStrategy>(field: K, value: ContentStrategy[K]) =>
    onChange({ ...draft, [field]: value }, [field as Mark])

  const setPillars = (next: ContentPillar[], touched: Mark[] = []) => onChange({ ...draft, pillars: next }, touched)

  const updatePillar = (id: string, patch: Partial<ContentPillar>) =>
    setPillars(
      pillars.map((pillar) => (pillar.id === id ? { ...pillar, ...patch } : pillar)),
      [`pillar:${id}`],
    )

  function move(index: number, by: -1 | 1) {
    const next = [...pillars]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    setPillars(next)
  }

  const markClass = (mark: Mark) => (marks.has(mark) ? SUGGESTED : '')

  return (
    <div className="space-y-6">
      {warnings.map((warning) => (
        <Notice key={warning} tone="warning">
          {warning}
        </Notice>
      ))}

      <label className={LABEL}>
        <FieldTitle suggested={marks.has('identity')}>{t('strategyCard.text13')}</FieldTitle>
        <input
          value={draft.identity}
          onChange={(event) => set('identity', event.target.value)}
          maxLength={STRATEGY_LIMITS.identity}
          placeholder={t('strategyCard.text19')}
          className={`${FIELD} text-base font-semibold ${markClass('identity')}`}
        />
      </label>

      <fieldset className="space-y-3" aria-label={t('strategyCard.text14')}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-sm font-medium text-zinc-900">{t('strategyCard.text14')}</p>
          <TotalBadge total={total} gap={gap} />
        </div>

        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
          {pillars.map((pillar, index) => (
            <div
              key={pillar.id}
              className={`h-full transition-[width] duration-300 ease-out not-last:border-r-2 not-last:border-white ${SHADES[index % SHADES.length]}`}
              style={{ width: `${Math.max(0, Math.min(pillar.share, 100))}%` }}
              title={`${pillar.name || t('strategyCard.text20', { v0: index + 1 })} ${pillar.share}%`}
            />
          ))}
        </div>

        <ol className="space-y-3">
          {pillars.map((pillar, index) => {
            const label = pillar.name.trim() || t('strategyCard.text21', { v0: index + 1 })
            return (
              <li key={pillar.id} className={`space-y-3 rounded-lg border p-3 ${marks.has(`pillar:${pillar.id}`) ? SUGGESTED : 'border-zinc-200 bg-white'}`}>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${SHADES[index % SHADES.length]}`} />
                  <span className="text-xs font-medium text-zinc-500">
                    {t('strategyCard.pillarNumber', { number: index + 1 })}
                    {marks.has(`pillar:${pillar.id}`) && <span className="ml-2 font-normal text-amber-700">{t('strategyCard.text23')}</span>}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t('strategyCard.text24', { v0: label })} className={ICON_BUTTON}>
                      <ArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === pillars.length - 1}
                      aria-label={t('strategyCard.text25', { v0: label })}
                      className={ICON_BUTTON}
                    >
                      <ArrowDown size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPillars(pillars.filter((item) => item.id !== pillar.id))}
                      disabled={pillars.length <= MIN_PILLARS}
                      aria-label={t('strategyCard.text26', { v0: label })}
                      title={pillars.length <= MIN_PILLARS ? t('strategyCard.text27', { v0: MIN_PILLARS }) : undefined}
                      className={`${ICON_BUTTON} hover:border-red-200 hover:bg-red-50 hover:text-red-700`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <input
                    value={pillar.name}
                    onChange={(event) => updatePillar(pillar.id, { name: event.target.value })}
                    maxLength={STRATEGY_LIMITS.pillarName}
                    placeholder={t('strategyCard.text28')}
                    aria-label={t('strategyCard.text29', { v0: index + 1 })}
                    className={FIELD}
                  />
                  <input
                    value={pillar.detail}
                    onChange={(event) => updatePillar(pillar.id, { detail: event.target.value })}
                    maxLength={STRATEGY_LIMITS.pillarDetail}
                    placeholder={t('strategyCard.text30')}
                    aria-label={t('strategyCard.text31', { v0: label })}
                    className={FIELD}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={MIN_SHARE}
                    max={100}
                    step={1}
                    value={clamp(pillar.share, MIN_SHARE, 100)}
                    onChange={(event) => updatePillar(pillar.id, { share: Number(event.target.value) })}
                    aria-label={t('strategyCard.text32', { v0: label })}
                    aria-valuetext={`${pillar.share}%`}
                    className="h-2 min-w-0 flex-1 cursor-pointer accent-accent"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={MIN_SHARE}
                      max={100}
                      step={1}
                      value={pillar.share}
                      onChange={(event) => {
                        const value = Math.round(Number(event.target.value))
                        updatePillar(pillar.id, { share: Number.isFinite(value) ? clamp(value, 0, 100) : 0 })
                      }}
                      onBlur={() => {
                        if (pillar.share < MIN_SHARE) updatePillar(pillar.id, { share: MIN_SHARE })
                      }}
                      aria-label={t('strategyCard.text33', { v0: label })}
                      className={`${FIELD} w-18 text-right tabular-nums`}
                    />
                    <span className="text-sm text-zinc-500" aria-hidden="true">
                      %
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPillars([...pillars, { id: newPillarId(), name: '', detail: '', share: MIN_SHARE }])}
            disabled={pillars.length >= MAX_PILLARS}
            title={pillars.length >= MAX_PILLARS ? t('strategyCard.text34', { v0: MAX_PILLARS }) : undefined}
            className={BUTTON}
          >
            <Plus size={14} aria-hidden="true" />
            {t('strategyCard.text35')}</button>
          <button
            type="button"
            onClick={() => {
              const shares = evenShares(pillars.length)
              setPillars(pillars.map((pillar, index) => ({ ...pillar, share: shares[index] })))
            }}
            className={BUTTON}
          >
            <Equal size={14} aria-hidden="true" />
            {t('strategyCard.text36')}</button>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={LABEL}>
          <FieldTitle suggested={marks.has('tone')}>{t('strategyCard.text15')}</FieldTitle>
          <input
            value={draft.tone}
            onChange={(event) => set('tone', event.target.value)}
            maxLength={STRATEGY_LIMITS.tone}
            placeholder={t('strategyCard.text37')}
            className={`${FIELD} ${markClass('tone')}`}
          />
        </label>
        <label className={LABEL}>
          <FieldTitle suggested={marks.has('focus')}>{t('strategyCard.text16')}</FieldTitle>
          <select
            value={draft.focus}
            onChange={(event) => {
              if (isFocus(event.target.value)) set('focus', event.target.value)
            }}
            className={`${FIELD} ${markClass('focus')}`}
          >
            {(Object.entries(FOCUS_LABELS) as [StrategyFocus, string][]).map(([value]) => (
              <option key={value} value={value}>
                {t(`focus.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          <FieldTitle suggested={marks.has('postsPerWeek')}>{t('strategyCard.text17')}</FieldTitle>
          <span className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={MIN_POSTS_PER_WEEK}
              max={MAX_POSTS_PER_WEEK}
              step={1}
              value={draft.postsPerWeek}
              onChange={(event) => {
                const value = Math.round(Number(event.target.value))
                if (Number.isFinite(value)) set('postsPerWeek', clamp(value, MIN_POSTS_PER_WEEK, MAX_POSTS_PER_WEEK))
              }}
              className={`${FIELD} w-20 text-right tabular-nums ${markClass('postsPerWeek')}`}
            />
            <span className="text-sm font-normal text-zinc-500">{t('strategyCard.text38')}</span>
          </span>
        </label>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4">
        <button type="button" onClick={onSave} disabled={busy || !dirty || total !== 100} className={PRIMARY_BUTTON}>
          {saving ? t('strategyCard.text39') : t('strategyCard.text40')}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={BUTTON}>
          {t('strategyCard.text41')}</button>
        <button type="button" onClick={onGenerate} disabled={busy} className={`${BUTTON} sm:ml-auto`}>
          <Sparkles size={14} aria-hidden="true" className="text-accent" />
          {generating ? t('strategyCard.text42') : t('strategyCard.text43')}
          <span className="text-xs font-normal text-zinc-500">{t('strategyCard.text44')}</span>
        </button>
        {dirty && total === 100 && invalid && !error && (
          <p className="basis-full text-sm text-amber-700">{invalid}</p>
        )}
        {marks.size > 0 && !error && (
          <p className="basis-full text-xs text-amber-700">{t('strategyCard.text45')}</p>
        )}
      </div>
    </div>
  )
}

function FieldTitle({ suggested, children }: { suggested: boolean; children: ReactNode }) {
  const t = useTranslations('brand')
  return (
    <span>
      {children}
      {suggested && <span className="ml-2 text-xs font-normal text-amber-700">{t('strategyCard.text23')}</span>}
    </span>
  )
}

function TotalBadge({ total, gap }: { total: number; gap: number }) {
  const t = useTranslations('brand')
  const ok = gap === 0
  return (
    <p
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
        ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}
    >
      <span>{t('strategyCard.total', { total })}</span>
      {!ok && <span className="font-normal">{gap < 0 ? t('strategyCard.text47', { v0: -gap }) : t('strategyCard.text48', { v0: gap })}</span>}
    </p>
  )
}
