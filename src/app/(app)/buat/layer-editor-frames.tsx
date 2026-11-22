'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { shapeFillRule, traceShape } from '@/lib/shape-paths'
import { FRAME_PRESETS, type FramePreset } from './layer-editor-frame-math'
import { SvgPathRecorder } from './layer-editor-shapes'

/** Presets visible before Lihat semua: two rows of the panel's six columns. */
const PREVIEW_COUNT = 12

/** The longest side of a preview, in the icon's 24-unit viewBox (2 units of breathing room for the dashed stroke). */
const ICON_SIDE = 20

interface PresetIcon {
  /** The outline, traced by the canvas geometry. */
  d: string
  /** The landscape glyph (back hill, front hill) and sun, laid out in the preset's own box. */
  back: string
  front: string
  sun: { cx: number; cy: number; r: number }
}

const n = (value: number) => Math.round(value * 100) / 100
const cache = new Map<string, PresetIcon>()

/**
 * The preset at its own aspect, centred in a 24×24 box, plus a little photo (sun + two hills) laid out in that same
 * box: a wide pill gets a wide landscape, a story frame a tall one, so the picture always sits inside the shape.
 */
function presetIcon(preset: FramePreset): PresetIcon {
  let hit = cache.get(preset.id)
  if (!hit) {
    const w = preset.aspect >= 1 ? ICON_SIDE : ICON_SIDE * preset.aspect
    const h = preset.aspect >= 1 ? ICON_SIDE / preset.aspect : ICON_SIDE
    const x = (24 - w) / 2
    const y = (24 - h) / 2
    const recorder = new SvgPathRecorder()
    const radius = 'radius' in preset ? Math.min(w, h) * preset.radius : 0
    traceShape(recorder, preset.shape, { x, y, w, h }, radius)
    const px = (fx: number) => n(x + w * fx)
    const py = (fy: number) => n(y + h * fy)
    // Hills overshoot the box sideways and downwards; the clip trims them to the shape.
    hit = {
      d: recorder.d,
      back: `M${px(-0.1)} ${py(1.1)}L${px(0.62)} ${py(0.5)}L${px(1.1)} ${py(0.86)}L${px(1.1)} ${py(1.1)}Z`,
      front: `M${px(-0.1)} ${py(0.78)}L${px(0.3)} ${py(0.6)}L${px(0.66)} ${py(1.1)}L${px(-0.1)} ${py(1.1)}Z`,
      // Off-centre but well inside even narrow tops (triangle, heart, star).
      sun: { cx: px(0.62), cy: py(0.37), r: n(Math.max(1.3, Math.min(w, h) * 0.1)) },
    }
    cache.set(preset.id, hit)
  }
  return hit
}

/**
 * A bingkai preview: a soft "photo" (sun and hills) clipped to the shape under a dashed outline, so it reads as
 * "a picture goes here" rather than a plain shape (whose icon is a solid outline with a flat tint).
 */
export function FrameIcon({ preset, className }: { preset: FramePreset; className?: string }) {
  const { d, back, front, sun } = presetIcon(preset)
  // One clipPath per rendered icon: the same preset may be on screen twice (menu + layer list…).
  const clip = `frame-icon-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const rule = shapeFillRule(preset.shape)
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <defs>
        <clipPath id={clip}><path d={d} clipRule={rule} /></clipPath>
      </defs>
      <g clipPath={`url(#${clip})`} fill="currentColor">
        <path d={d} fillOpacity={0.1} fillRule={rule} />
        <circle cx={sun.cx} cy={sun.cy} r={sun.r} fillOpacity={0.5} />
        <path d={back} fillOpacity={0.26} />
        <path d={front} fillOpacity={0.46} />
      </g>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.25} strokeDasharray="2 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Same tile as Bentuk's, so the two menus read as one family; motion is opt-out for reduced-motion users.
const TILE = 'group flex min-w-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft/40 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:border-hairline disabled:bg-white disabled:text-ink-soft motion-reduce:transition-none'

/** Bingkai: frame shapes a picture is dropped into, Canva-style. */
export function FrameMenu({ disabled, onAdd }: { disabled: boolean; onAdd: (preset: FramePreset) => void }) {
  const t = useTranslations('editor.layerEditor')
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? FRAME_PRESETS : FRAME_PRESETS.slice(0, PREVIEW_COUNT)
  return (
    <section aria-labelledby="layer-add-frame">
      <h3 id="layer-add-frame" className="mb-1 text-xs font-semibold tracking-wide text-ink-soft uppercase">{t('frames.title')}</h3>
      <p className="mb-2 text-[11px] leading-relaxed text-ink-muted">{t('frames.menuHint')}</p>
      <ul className="grid min-w-0 grid-cols-6 gap-1.5">
        {shown.map((preset) => {
          const name = t(`frames.presets.${preset.id}`)
          return (
            <li key={preset.id} className="min-w-0">
              <button type="button" disabled={disabled} onClick={() => onAdd(preset)} aria-label={t('frames.add', { name })} title={name}
                className={`${TILE} aspect-square min-h-11 w-full`}>
                <FrameIcon preset={preset} className="size-8 transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110 group-disabled:scale-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100" />
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}
        className="mt-1.5 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-xs font-semibold text-accent hover:text-accent-deep focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11">
        {expanded ? t('showFewerShapes') : t('showAllShapes', { count: FRAME_PRESETS.length })}
        <ChevronDown size={14} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </section>
  )
}
