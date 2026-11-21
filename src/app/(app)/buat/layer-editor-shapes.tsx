'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown, PenTool } from 'lucide-react'
import { useState } from 'react'
import {
  CLOSED_SHAPE_KINDS, LINE_KINDS, shapeFillRule, traceShape,
  type PathContext, type ShapeBox, type ShapeKind, type StrokeDash,
} from '@/lib/shape-paths'

/**
 * A PathContext that records SVG path data instead of drawing, so a menu icon or an overlay preview is traced by the
 * exact same geometry as the canvas (traceShape / tracePath).
 */
export class SvgPathRecorder implements PathContext {
  private parts: string[] = []
  private start: [number, number] | null = null
  private current: [number, number] | null = null

  private static n(value: number) {
    return Math.round(value * 100) / 100
  }

  private push(command: string, ...values: number[]) {
    this.parts.push(`${command}${values.map(SvgPathRecorder.n).join(' ')}`)
  }

  get d() {
    return this.parts.join('')
  }

  moveTo(x: number, y: number) {
    this.push('M', x, y)
    this.start = [x, y]
    this.current = [x, y]
  }

  lineTo(x: number, y: number) {
    if (!this.current) return this.moveTo(x, y)
    this.push('L', x, y)
    this.current = [x, y]
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    if (!this.current) this.moveTo(c1x, c1y)
    this.push('C', c1x, c1y, c2x, c2y, x, y)
    this.current = [x, y]
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    if (!this.current) this.moveTo(cx, cy)
    this.push('Q', cx, cy, x, y)
    this.current = [x, y]
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean) {
    this.ellipse(x, y, radius, radius, 0, startAngle, endAngle, counterclockwise)
  }

  /** Canvas ellipse semantics (rotation unused by the shapes): a line to the arc's start, then the sweep in quarters. */
  ellipse(cx: number, cy: number, rx: number, ry: number, _rotation: number, startAngle: number, endAngle: number, counterclockwise = false) {
    const tau = Math.PI * 2
    const raw = counterclockwise ? startAngle - endAngle : endAngle - startAngle
    const sweep = raw >= tau ? tau : ((raw % tau) + tau) % tau
    const sx = cx + rx * Math.cos(startAngle)
    const sy = cy + ry * Math.sin(startAngle)
    if (this.current) this.lineTo(sx, sy)
    else this.moveTo(sx, sy)
    if (sweep === 0) return
    const steps = Math.max(1, Math.ceil(sweep / (Math.PI / 2) - 1e-9))
    const direction = counterclockwise ? -1 : 1
    for (let step = 1; step <= steps; step++) {
      const angle = startAngle + (direction * sweep * step) / steps
      const x = cx + rx * Math.cos(angle)
      const y = cy + ry * Math.sin(angle)
      this.parts.push(`A${SvgPathRecorder.n(rx)} ${SvgPathRecorder.n(ry)} 0 0 ${counterclockwise ? 0 : 1} ${SvgPathRecorder.n(x)} ${SvgPathRecorder.n(y)}`)
      this.current = [x, y]
    }
  }

  closePath() {
    this.parts.push('Z')
    this.current = this.start
  }

  roundRect(x: number, y: number, w: number, h: number, radius: number) {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2))
    this.moveTo(x + r, y)
    this.lineTo(x + w - r, y)
    if (r) this.ellipse(x + w - r, y + r, r, r, 0, -Math.PI / 2, 0)
    this.lineTo(x + w, y + h - r)
    if (r) this.ellipse(x + w - r, y + h - r, r, r, 0, 0, Math.PI / 2)
    this.lineTo(x + r, y + h)
    if (r) this.ellipse(x + r, y + h - r, r, r, 0, Math.PI / 2, Math.PI)
    this.lineTo(x, y + r)
    if (r) this.ellipse(x + r, y + r, r, r, 0, Math.PI, Math.PI * 1.5)
    this.closePath()
    this.current = [x, y]
  }
}

/** Where each kind sits in a 24×24 icon: wide shapes get a wide box, flat lines a thin strip. */
const ICON_BOX: Partial<Record<ShapeKind, ShapeBox>> = {
  parallelogram: { x: 2, y: 6, w: 20, h: 12 },
  trapezoid: { x: 2, y: 6, w: 20, h: 12 },
  chevron: { x: 3, y: 5, w: 18, h: 14 },
  blockArrow: { x: 2, y: 5, w: 20, h: 14 },
  ribbon: { x: 2, y: 6, w: 20, h: 12 },
  speechBubble: { x: 2, y: 3, w: 20, h: 18 },
  cloud: { x: 2, y: 5, w: 20, h: 14 },
  halfCircle: { x: 2, y: 7, w: 20, h: 10 },
  moon: { x: 4, y: 3, w: 15, h: 18 },
  teardrop: { x: 5, y: 2, w: 14, h: 20 },
  shield: { x: 4, y: 2, w: 16, h: 20 },
  line: { x: 2, y: 8, w: 20, h: 8 },
  arrow: { x: 2, y: 7, w: 20, h: 10 },
  doubleArrow: { x: 2, y: 7, w: 20, h: 10 },
  curve: { x: 3, y: 7, w: 18, h: 10 },
  zigzag: { x: 2, y: 8, w: 20, h: 8 },
  wave: { x: 2, y: 9, w: 20, h: 6 },
  elbow: { x: 4, y: 5, w: 16, h: 14 },
}
const DEFAULT_BOX: ShapeBox = { x: 3, y: 3, w: 18, h: 18 }

const iconCache = new Map<ShapeKind, string>()
/** The SVG path data of `kind` in a 24×24 icon, traced by traceShape itself. */
export function shapeIconPath(kind: ShapeKind): string {
  let d = iconCache.get(kind)
  if (d === undefined) {
    const recorder = new SvgPathRecorder()
    traceShape(recorder, kind, ICON_BOX[kind] ?? DEFAULT_BOX, kind === 'rect' ? 2.5 : 0)
    d = recorder.d
    iconCache.set(kind, d)
  }
  return d
}

const LINE_SET: ReadonlySet<ShapeKind> = new Set<ShapeKind>(LINE_KINDS)

export function ShapeIcon({ kind, className }: { kind: ShapeKind; className?: string }) {
  const line = LINE_SET.has(kind)
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d={shapeIconPath(kind)}
        fill={line ? 'none' : 'currentColor'}
        fillOpacity={line ? undefined : 0.16}
        fillRule={line ? undefined : shapeFillRule(kind)}
        stroke="currentColor"
        strokeWidth={line ? 1.8 : 1.4}
        strokeLinecap="round"
        strokeLinejoin={line && kind !== 'arrow' ? 'round' : 'miter'}
      />
    </svg>
  )
}

/** A short preview of a stroke style, for the Gaya garis control. */
export function DashIcon({ dash }: { dash: StrokeDash | undefined }) {
  return (
    <svg viewBox="0 0 32 8" aria-hidden="true" className="h-2 w-8">
      <line x1="3" y1="4" x2="29" y2="4" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap={dash === 'dashed' ? 'butt' : 'round'}
        strokeDasharray={dash === 'dashed' ? '7 4' : dash === 'dotted' ? '0 5' : undefined} />
    </svg>
  )
}

/** Closed shapes visible before Lihat semua: two rows of the panel's six columns. */
const PREVIEW_COUNT = 12

const TILE = 'group flex min-w-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft/40 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:border-hairline disabled:bg-white disabled:text-ink-soft'

interface ShapeMenuProps {
  disabled: boolean
  drawing: boolean
  onAdd: (kind: ShapeKind) => void
  onDraw: () => void
}

/** Tambah Bentuk: icon tiles traced from the real geometry, Bentuk and Garis apart, then the pen for a free shape. */
export function ShapeMenu({ disabled, drawing, onAdd, onDraw }: ShapeMenuProps) {
  const t = useTranslations('editor.layerEditor')
  const [tab, setTab] = useState<'closed' | 'lines'>('closed')
  const [expanded, setExpanded] = useState(false)
  const closed = expanded ? CLOSED_SHAPE_KINDS : CLOSED_SHAPE_KINDS.slice(0, PREVIEW_COUNT)
  const tabClass = (on: boolean) =>
    `inline-flex min-h-8 items-center rounded-md px-2.5 text-xs font-semibold transition-colors pointer-coarse:min-h-10 focus-visible:outline-2 focus-visible:outline-accent ${
      on ? 'bg-white text-ink shadow-[0_1px_2px_rgba(23,24,39,0.12)]' : 'text-ink-muted hover:text-ink'}`

  return (
    <section aria-labelledby="layer-add-shape">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="layer-add-shape" className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{t('addShape')}</h3>
        <div role="group" aria-label={t('addShape')} className="inline-flex rounded-lg border border-hairline bg-zinc-50 p-0.5">
          <button type="button" aria-pressed={tab === 'closed'} onClick={() => setTab('closed')} className={tabClass(tab === 'closed')}>
            {t('shapeGroups.closed')}
          </button>
          <button type="button" aria-pressed={tab === 'lines'} onClick={() => setTab('lines')} className={tabClass(tab === 'lines')}>
            {t('shapeGroups.lines')}
          </button>
        </div>
      </div>

      {tab === 'closed' ? (
        <>
          <ul className="grid min-w-0 grid-cols-6 gap-1.5">
            {closed.map((kind) => (
              <li key={kind} className="min-w-0">
                <button type="button" disabled={disabled} onClick={() => onAdd(kind)} aria-label={t(`shapes.${kind}`)} title={t(`shapes.${kind}`)}
                  className={`${TILE} aspect-square min-h-11 w-full`}>
                  <ShapeIcon kind={kind} className="size-6 transition-transform duration-150 group-hover:scale-110 group-disabled:scale-100" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}
            className="mt-1.5 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-xs font-semibold text-accent hover:text-accent-deep focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11">
            {expanded ? t('showFewerShapes') : t('showAllShapes', { count: CLOSED_SHAPE_KINDS.length })}
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </>
      ) : (
        <ul className="mb-1.5 grid min-w-0 grid-cols-4 gap-1.5">
          {LINE_KINDS.map((kind) => (
            <li key={kind} className="min-w-0">
              <button type="button" disabled={disabled} onClick={() => onAdd(kind)} aria-label={t(`shapes.${kind}`)} title={t(`shapes.${kind}`)}
                className={`${TILE} h-11 w-full`}>
                <ShapeIcon kind={kind} className="h-6 w-9 transition-transform duration-150 group-hover:scale-110 group-disabled:scale-100" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={disabled}
        aria-pressed={drawing}
        onClick={onDraw}
        className={`mt-1 flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:border-hairline disabled:bg-white disabled:text-ink-soft ${
          drawing ? 'border-accent bg-accent-soft/50' : 'border-dashed border-zinc-300 bg-white hover:border-accent/50 hover:bg-accent-soft/30'}`}
      >
        <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${drawing ? 'bg-accent text-white' : 'bg-accent-soft text-accent'}`}>
          <PenTool size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{t('shapes.path')}</span>
          <span className="block text-xs text-ink-muted">{drawing ? t('penDrawing') : t('penDescription')}</span>
        </span>
      </button>
    </section>
  )
}
