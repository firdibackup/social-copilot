'use client'

import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown, Search, Sparkles, X } from 'lucide-react'
import { useId, useState } from 'react'
import { AI_ELEMENT_UNITS, formatCreditShare } from '@/lib/billing-options'
import { cleanElementPrompt, ELEMENT_PROMPT_MAX } from '@/lib/element-options'
import { searchItems } from '@/lib/element-search'
import { SHAPE_KINDS, type ShapeKind } from '@/lib/shape-paths'
import { TEXT_PRESET_IDS, type TextPresetId } from '@/lib/text-presets'
import { ELEMENT_ICONS, ICON_CATEGORIES, iconText, type ElementIcon, type IconCategory } from './layer-editor-icons'
import { ShapeIcon } from './layer-editor-shapes'

const HEADING = 'text-xs font-semibold tracking-wide text-ink-soft uppercase'
const TILE = 'group flex min-w-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft/40 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:border-hairline disabled:bg-white disabled:text-ink-soft'
const MORE = 'mt-1.5 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-xs font-semibold text-accent hover:text-accent-deep focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11'

/** Icons before Lihat semua: three rows of the panel's six columns. */
const ICON_PREVIEW = 18
/** The PNG an icon is drawn into: sharp enough when the layer is enlarged to half a slide. */
const ICON_PX = 512

/** How each preset looks on its tile; the real font and size apply on the slide. */
const PRESET_LOOK: Record<TextPresetId, string> = {
  headline: 'text-lg font-extrabold leading-tight',
  subheading: 'text-sm font-semibold',
  body: 'text-xs font-normal',
  kicker: 'text-[11px] font-bold tracking-[0.14em] uppercase text-accent',
  quote: 'text-sm font-medium italic',
  number: 'text-2xl font-extrabold leading-none text-accent',
}

const SAMPLE_KEY = {
  headline: 'sampleHeadline', subheading: 'sampleSubheading', body: 'sampleBody', kicker: 'sampleKicker', quote: 'sampleQuote', number: 'sampleNumber',
} as const satisfies Record<TextPresetId, string>

/** Gaya teks: one tile per editorial style; the tile's own words become the new layer's text. */
export function TextStyleMenu({ disabled, onAdd }: { disabled: boolean; onAdd: (preset: TextPresetId, text: string) => void }) {
  const t = useTranslations('editor.layerEditor.textStyles')
  return (
    <section aria-labelledby="layer-text-styles">
      <h3 id="layer-text-styles" className={`mb-1 ${HEADING}`}>{t('title')}</h3>
      <p className="mb-2 text-[11px] leading-relaxed text-ink-muted">{t('hint')}</p>
      <ul className="grid min-w-0 grid-cols-2 gap-1.5">
        {TEXT_PRESET_IDS.map((id) => (
          <li key={id} className="min-w-0">
            <button type="button" disabled={disabled} onClick={() => onAdd(id, t(SAMPLE_KEY[id]))}
              className={`${TILE} min-h-16 w-full flex-col items-start justify-center gap-0.5 px-3 py-2 text-left`}>
              <span className={`block max-w-full truncate ${PRESET_LOOK[id]}`}>{t(SAMPLE_KEY[id])}</span>
              <span className="block text-[11px] font-medium text-ink-muted group-hover:text-accent">{t(id)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The icon's SVG as a transparent PNG file in `color`, drawn by the browser from the tile's own <svg>, so the icon
 * travels the ordinary layer-upload path and no SVG is ever sent to the server.
 */
export async function iconPng(svg: SVGSVGElement, color: string, size = ICON_PX): Promise<File> {
  const node = svg.cloneNode(true) as SVGSVGElement
  node.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  node.setAttribute('width', String(size))
  node.setAttribute('height', String(size))
  node.setAttribute('stroke', color)
  node.removeAttribute('class')
  node.removeAttribute('style')
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(node)], { type: 'image/svg+xml' }))
  try {
    const image = new window.Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('icon_failed'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('icon_failed')
    context.drawImage(image, 0, 0, size, size)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('icon_failed')
    return new File([blob], 'icon.png', { type: 'image/png' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function IconTile({ item, disabled, onAdd }: { item: ElementIcon; disabled: boolean; onAdd: (item: ElementIcon, svg: SVGSVGElement) => void }) {
  const locale = useLocale()
  const label = locale === 'en' ? item.id.replace(/([a-z])([A-Z0-9])/g, '$1 $2') : item.label
  return (
    <li className="min-w-0">
      <button type="button" disabled={disabled} aria-label={label} title={label}
        onClick={(event) => {
          const svg = event.currentTarget.querySelector('svg')
          if (svg) onAdd(item, svg)
        }}
        className={`${TILE} aspect-square min-h-11 w-full`}>
        <item.Icon size={22} aria-hidden="true" className="transition-transform duration-150 group-hover:scale-110 group-disabled:scale-100" />
      </button>
    </li>
  )
}

interface IconMenuProps {
  disabled: boolean
  /** The colour a new icon is drawn in. */
  color: string
  /** Offered beside the colour picker: the slide's ink colour, its opposite and the brand's colours. */
  swatches: string[]
  onColor: (color: string) => void
  onAdd: (item: ElementIcon, svg: SVGSVGElement) => void
}

/** Ikon: Lucide icons by category, in the colour chosen here (an icon becomes a picture layer, so it is set first). */
export function IconMenu({ disabled, color, swatches, onColor, onAdd }: IconMenuProps) {
  const t = useTranslations('editor.layerEditor.elements')
  const colorId = useId()
  const [category, setCategory] = useState<IconCategory | 'all'>('all')
  const [expanded, setExpanded] = useState(false)
  const inCategory = category === 'all' ? ELEMENT_ICONS : ELEMENT_ICONS.filter((item) => item.category === category)
  const shown = expanded || category !== 'all' ? inCategory : inCategory.slice(0, ICON_PREVIEW)
  const chip = (on: boolean) =>
    `inline-flex min-h-8 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium transition-colors pointer-coarse:min-h-10 focus-visible:outline-2 focus-visible:outline-accent ${
      on ? 'border-ink bg-ink text-white' : 'border-hairline bg-white text-ink-muted hover:text-ink'}`

  return (
    <section aria-labelledby="layer-add-icon">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="layer-add-icon" className={HEADING}>{t('icons')}</h3>
        <div className="flex items-center gap-1.5">
          {swatches.map((swatch) => (
            <button key={swatch} type="button" aria-label={`${t('iconColor')} ${swatch}`} aria-pressed={color === swatch} onClick={() => onColor(swatch)}
              className={`size-6 rounded-full border ${color === swatch ? 'border-accent ring-2 ring-accent/40' : 'border-zinc-300'}`}
              style={{ backgroundColor: swatch }} />
          ))}
          <label htmlFor={colorId} className="sr-only">{t('iconColor')}</label>
          <input id={colorId} type="color" value={color} onChange={(event) => onColor(event.target.value.toUpperCase())}
            className="size-7 cursor-pointer rounded border border-hairline bg-white p-0.5" />
        </div>
      </div>
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {(['all', ...ICON_CATEGORIES] as const).map((item) => (
          <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={chip(category === item)}>
            {t(`iconCategories.${item}`)}
          </button>
        ))}
      </div>
      <ul className="grid min-w-0 grid-cols-6 gap-1.5">
        {shown.map((item) => <IconTile key={item.id} item={item} disabled={disabled} onAdd={onAdd} />)}
      </ul>
      {category === 'all' && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className={MORE}>
          {expanded ? t('showFewerIcons') : t('showAllIcons', { count: ELEMENT_ICONS.length })}
          <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </section>
  )
}

/** Cari elemen: the field above the Elemen tab; an empty value shows the ordinary menus. */
export function ElementSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('editor.layerEditor.elements')
  const id = useId()
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{t('search')}</label>
      <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" />
      <input id={id} type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={t('searchPlaceholder')}
        autoComplete="off" maxLength={60}
        className="min-h-10 w-full rounded-lg border border-hairline bg-white pr-9 pl-9 text-sm text-ink placeholder:text-ink-soft focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label={t('clearSearch')}
          className="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-zinc-100 hover:text-ink">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

interface ElementResultsProps {
  query: string
  disabled: boolean
  onShape: (kind: ShapeKind) => void
  onIcon: (item: ElementIcon, svg: SVGSVGElement) => void
}

/** What the search found among the shapes (by their translated names) and the icons. */
export function ElementResults({ query, disabled, onShape, onIcon }: ElementResultsProps) {
  const t = useTranslations('editor.layerEditor')
  const shapes = searchItems(SHAPE_KINDS, (kind) => `${t(`shapes.${kind}`)} ${kind}`, query)
  const icons = searchItems(ELEMENT_ICONS, iconText, query)
  if (shapes.length === 0 && icons.length === 0) {
    return <p role="status" className="rounded-lg border border-dashed border-hairline px-3 py-4 text-center text-xs leading-relaxed text-ink-muted">{t('elements.noResults')}</p>
  }
  return (
    <div role="status" className="space-y-4">
      {shapes.length > 0 && (
        <section>
          <h3 className={`mb-2 ${HEADING}`}>{t('elements.shapesFound')}</h3>
          <ul className="grid min-w-0 grid-cols-6 gap-1.5">
            {shapes.map((kind) => (
              <li key={kind} className="min-w-0">
                <button type="button" disabled={disabled} onClick={() => onShape(kind)} aria-label={t(`shapes.${kind}`)} title={t(`shapes.${kind}`)}
                  className={`${TILE} aspect-square min-h-11 w-full`}>
                  <ShapeIcon kind={kind} className="size-6" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {icons.length > 0 && (
        <section>
          <h3 className={`mb-2 ${HEADING}`}>{t('elements.iconsFound')}</h3>
          <ul className="grid min-w-0 grid-cols-6 gap-1.5">
            {icons.map((item) => <IconTile key={item.id} item={item} disabled={disabled} onAdd={onIcon} />)}
          </ul>
        </section>
      )}
    </div>
  )
}

interface AiElementCardProps {
  disabled: boolean
  /** Credits per unit of magic_layers. */
  rate: number
  planCredits: number
  /** Credits left in the period; null when unknown (the server still checks). */
  credits: number | null
  /** Free credits left on the trial; null for a paying user. */
  trial: number | null
  /** Draws the element and places it; resolves to a message when it failed. */
  onRun: (prompt: string) => Promise<string | null>
}

/** Elemen AI: a description becomes a cut-out picture layer; the price is shown before the one request runs. */
export function AiElementCard({ disabled, rate, planCredits, credits, trial, onRun }: AiElementCardProps) {
  const t = useTranslations('editor.layerEditor.elements')
  const locale = useLocale()
  const id = useId()
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cost = rate * AI_ELEMENT_UNITS
  const short = credits !== null && cost > credits
  const ready = cleanElementPrompt(prompt) !== null && !running && !disabled && trial === null && !short

  async function run() {
    if (!ready) return
    setRunning(true)
    setError(null)
    const failure = await onRun(prompt.trim()).catch(() => t('aiFailed'))
    setRunning(false)
    if (failure) setError(failure)
    else setPrompt('')
  }

  return (
    <section aria-labelledby="layer-ai-element" className="rounded-xl border border-accent/25 bg-[linear-gradient(135deg,var(--color-accent-soft),#fff_70%)] p-3.5">
      <h3 id="layer-ai-element" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Sparkles size={15} aria-hidden="true" className="text-accent" />
        {t('aiTitle')}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t('aiDescription')}</p>
      <label htmlFor={id} className="sr-only">{t('aiPrompt')}</label>
      <textarea id={id} rows={2} value={prompt} maxLength={ELEMENT_PROMPT_MAX} disabled={running || disabled} placeholder={t('aiPlaceholder')}
        onChange={(event) => setPrompt(event.target.value)}
        className="mt-2.5 w-full resize-none rounded-lg border border-hairline bg-white px-2.5 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-accent focus:outline-none disabled:bg-zinc-50" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-muted tabular-nums">{t('aiCost', { share: formatCreditShare(cost, planCredits, locale) })}</span>
        <button type="button" onClick={() => void run()} disabled={!ready}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-deep disabled:bg-zinc-200 disabled:text-ink-soft">
          <Sparkles size={15} aria-hidden="true" className={running ? 'animate-pulse' : ''} />
          {running ? t('aiWorking') : t('aiButton')}
        </button>
      </div>
      {trial !== null && <p className="mt-2 text-xs text-ink-muted">{t('aiNotInTrial')}</p>}
      {short && trial === null && <p role="alert" className="mt-2 text-xs text-red-700">{t('aiShort')}</p>}
      {error && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">{t('aiGreenHint')}</p>
    </section>
  )
}
