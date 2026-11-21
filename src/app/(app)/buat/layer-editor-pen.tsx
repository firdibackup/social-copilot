'use client'

import { useTranslations } from 'next-intl'
import { Check, PenTool, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { PATH_LIMITS, tracePath, type PathPoint } from '@/lib/shape-paths'
import { SvgPathRecorder } from './layer-editor-shapes'

/** What the pen hands back: absolute canvas points (handles absolute too) and whether the outline was closed. */
export interface PenResult { points: PathPoint[]; closed: boolean }

/** Screen px within which a press lands on the first point (closes) or repeats the last one (double tap: finish). */
const NEAR_PX = 12
const NEAR_COARSE_PX = 22
/** A press dragged further than this pulls out a bezier handle. */
const HANDLE_DRAG_PX = 4
const DOUBLE_TAP_MS = 350

export interface Pen {
  points: PathPoint[]
  hover: { x: number; y: number } | null
  canClose: boolean
  canFinish: boolean
  finish: (closed: boolean) => void
  cancel: () => void
  undoPoint: () => void
  setPoints: (update: (points: PathPoint[]) => PathPoint[]) => void
  setHover: (hover: { x: number; y: number } | null) => void
}

/** The pen's state, shared by the drawing surface over the slide and the bar above the canvas. */
export function usePen(onDone: (result: PenResult | null) => void): Pen {
  const [points, setPointsState] = useState<PathPoint[]>([])
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const pointsRef = useRef(points)
  const setPoints = (update: (points: PathPoint[]) => PathPoint[]) => {
    pointsRef.current = update(pointsRef.current)
    setPointsState(pointsRef.current)
  }
  const finish = (closed: boolean) => {
    const current = pointsRef.current
    if (current.length < (closed ? 3 : PATH_LIMITS.points.min)) return
    onDone({ points: current, closed })
  }
  return {
    points,
    hover,
    canClose: points.length >= 3,
    canFinish: points.length >= PATH_LIMITS.points.min,
    finish,
    cancel: () => onDone(null),
    undoPoint: () => setPoints((current) => current.slice(0, -1)),
    setPoints,
    setHover,
  }
}

interface Press { pointerId: number; index: number; x: number; y: number; pulled: boolean }

/**
 * The pen over the slide, in screen px (`scale` maps canvas px to screen px). Press to add a point, press and drag
 * to pull out a symmetric curve handle, press the first point to close, double-click (or tap twice) to finish open.
 */
export function PenSurface({ pen, scale, width, height }: { pen: Pen; scale: number; width: number; height: number }) {
  const t = useTranslations('editor.layerEditor')
  const ref = useRef<HTMLDivElement>(null)
  const press = useRef<Press | null>(null)
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null)
  const [coarse, setCoarse] = useState(false)

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])

  const near = coarse ? NEAR_COARSE_PX : NEAR_PX
  const toCanvas = (event: ReactPointerEvent) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale }
  }
  const screenDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) * scale

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    ref.current?.focus({ preventScroll: true })
    setCoarse(event.pointerType !== 'mouse')
    const at = toCanvas(event)
    const { points } = pen
    if (pen.canClose && screenDistance(at, points[0]) <= near) {
      pen.finish(true)
      return
    }
    const now = event.timeStamp
    const last = points.at(-1)
    if (lastTap.current && now - lastTap.current.at < DOUBLE_TAP_MS && last && screenDistance(at, last) <= near) {
      lastTap.current = null
      pen.finish(false)
      return
    }
    lastTap.current = { at: now, x: at.x, y: at.y }
    if (points.length >= PATH_LIMITS.points.max) return
    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = { pointerId: event.pointerId, index: points.length, x: at.x, y: at.y, pulled: false }
    pen.setPoints((current) => [...current, { x: at.x, y: at.y }])
    pen.setHover(null)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const at = toCanvas(event)
    const current = press.current
    if (!current || current.pointerId !== event.pointerId) {
      if (event.pointerType === 'mouse') pen.setHover(at)
      return
    }
    if (!current.pulled && screenDistance(at, current) < HANDLE_DRAG_PX) return
    current.pulled = true
    // A dragged point is a smooth one: its handles mirror each other.
    lastTap.current = null
    pen.setPoints((points) => points.map((point, index) => index !== current.index ? point : {
      x: current.x, y: current.y, out: { x: at.x, y: at.y }, in: { x: 2 * current.x - at.x, y: 2 * current.y - at.y },
    }))
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (press.current?.pointerId !== event.pointerId) return
    press.current = null
    if (pen.points.length >= PATH_LIMITS.points.max) pen.finish(false)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const mod = event.metaKey || event.ctrlKey
    if (event.key === 'Enter') pen.finish(false)
    else if (event.key === 'Escape') pen.cancel()
    else if (event.key === 'Backspace' || event.key === 'Delete' || (mod && event.key.toLowerCase() === 'z')) pen.undoPoint()
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  const box = { x: 0, y: 0, w: scale, h: scale }
  const trace = (points: readonly PathPoint[], closed = false) => {
    const recorder = new SvgPathRecorder()
    tracePath(recorder, points, closed, box)
    return recorder.d
  }
  const { points, hover } = pen
  const last = points.at(-1)
  const closing = Boolean(hover && pen.canClose && screenDistance(hover, points[0]) <= near)
  // Hover is cleared on every press, so the rubber band never shows while a handle is being pulled.
  const rubber = last && hover ? trace([last, closing ? points[0] : hover]) : ''
  const s = (value: number) => value * scale

  return (
    <div
      ref={ref}
      role="application"
      tabIndex={0}
      aria-label={t('penCanvas')}
      aria-describedby="layer-pen-hint"
      className="absolute inset-0 z-10 cursor-crosshair touch-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') pen.setHover(null) }}
      onKeyDown={onKeyDown}
    >
      <svg aria-hidden="true" width={width * scale} height={height * scale} className="pointer-events-none absolute inset-0 overflow-visible">
        {points.length > 1 && (
          <>
            <path d={trace(points)} fill="none" stroke="white" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
            <path d={trace(points)} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
        {rubber && (
          <path d={rubber} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round" />
        )}
        {points.map((point, index) => (
          <g key={index}>
            {point.in && <line x1={s(point.x)} y1={s(point.y)} x2={s(point.in.x)} y2={s(point.in.y)} stroke="var(--color-accent)" strokeWidth={1} />}
            {point.out && <line x1={s(point.x)} y1={s(point.y)} x2={s(point.out.x)} y2={s(point.out.y)} stroke="var(--color-accent)" strokeWidth={1} />}
            {point.in && <circle cx={s(point.in.x)} cy={s(point.in.y)} r={3} fill="var(--color-accent)" />}
            {point.out && <circle cx={s(point.out.x)} cy={s(point.out.y)} r={3} fill="var(--color-accent)" />}
          </g>
        ))}
        {points.map((point, index) => {
          const first = index === 0
          const highlight = first && (closing || (pen.canClose && coarse))
          return (
            <g key={`p${index}`}>
              {highlight && <circle cx={s(point.x)} cy={s(point.y)} r={near} fill="var(--color-accent)" fillOpacity={0.15} stroke="var(--color-accent)" strokeWidth={1} strokeDasharray="3 3" />}
              <rect x={s(point.x) - 4.5} y={s(point.y) - 4.5} width={9} height={9} rx={first ? 4.5 : 1.5}
                fill={index === points.length - 1 ? 'var(--color-accent)' : 'white'} stroke="var(--color-accent)" strokeWidth={1.5} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/**
 * Draw mode: the drawing surface over the slide, and its bar portalled into `barHost` (over the canvas area, so it
 * stays put while the slide scrolls). Mounted only while drawing, so a new drawing always starts empty.
 */
export function PenLayer({ scale, width, height, barHost, onDone }: {
  scale: number
  width: number
  height: number
  barHost: HTMLElement | null
  onDone: (result: PenResult | null) => void
}) {
  const pen = usePen(onDone)
  return (
    <>
      <PenSurface pen={pen} scale={scale} width={width} height={height} />
      {barHost && createPortal(<PenBar pen={pen} />, barHost)}
    </>
  )
}

/** The bar over the canvas while drawing: what to do next, and Selesai / Batal for those without a keyboard. */
export function PenBar({ pen }: { pen: Pen }) {
  const t = useTranslations('editor.layerEditor')
  const hint = pen.points.length === 0 ? t('penHintStart') : pen.canClose ? t('penHintClose') : t('penHintNext')
  const button = 'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 disabled:text-ink-soft'
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-hairline bg-white/95 py-1.5 pr-1.5 pl-3 shadow-[0_10px_30px_-12px_rgba(23,24,39,0.45)] backdrop-blur">
        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
          <PenTool size={14} />
        </span>
        <p id="layer-pen-hint" role="status" className="min-w-0 flex-1 text-xs leading-snug text-ink">
          {hint}
          <span className="hidden text-ink-muted md:inline"> {t('penKeys')}</span>
        </p>
        <button type="button" onClick={pen.undoPoint} disabled={pen.points.length === 0} aria-label={t('penUndoPoint')} title={t('penUndoPoint')}
          className={`${button} px-2 text-ink hover:bg-zinc-100`}>
          <Undo2 size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={pen.cancel} className={`${button} text-ink-muted hover:bg-zinc-100 hover:text-ink`}>
          <X size={14} aria-hidden="true" />
          <span className="max-sm:sr-only">{t('cancel')}</span>
        </button>
        <button type="button" onClick={() => pen.finish(false)} disabled={!pen.canFinish}
          className={`${button} bg-accent text-white hover:bg-accent-deep disabled:bg-zinc-200`}>
          <Check size={14} aria-hidden="true" />
          {t('penDone')}
        </button>
      </div>
    </div>
  )
}
