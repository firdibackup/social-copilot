'use client'

import { useTranslations } from 'next-intl'
import { ArrowUp, Layers2, Plus, Trash2 } from 'lucide-react'
import { useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  copyGradient, GRADIENT_LIMITS, GRADIENT_PRESETS, gradientCss, OVERLAY_PRESETS, stopCss,
  type Gradient, type GradientPreset,
} from '@/lib/gradients'
import type { Layer } from '@/lib/layer-doc'
import { addStop, gradientFrom, normalAngle, removeStop, updateStop } from './layer-editor-gradient'

/** A layer that can be filled with a gradient. */
type Fillable = Extract<Layer, { kind: 'text' | 'shape' | 'path' }>
export interface Fill { color: string; gradient?: Gradient }

/** The layer with a plain colour or a gradient fill (`color` follows the first stop, so older readers still see it). */
export function withFill(layer: Layer, fill: Fill): Layer {
  if (layer.kind === 'image') return layer
  const next = { ...layer } as Fillable
  if (fill.gradient) return { ...next, color: fill.gradient.stops[0].color, gradient: fill.gradient } as Layer
  delete next.gradient
  return { ...next, color: fill.color } as Layer
}

/** Light squares behind anything see-through. */
export const CHECKER: CSSProperties = {
  backgroundColor: '#fff',
  backgroundImage: 'conic-gradient(#e4e4e7 25%, transparent 0 50%, #e4e4e7 0 75%, transparent 0)',
  backgroundSize: '10px 10px',
}

const LABEL = 'mb-1 block text-xs font-medium text-ink-muted'
const SEGMENT = 'flex min-h-9 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11'
const SMALL = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white px-2.5 text-xs font-medium text-ink transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-accent disabled:text-ink-soft disabled:hover:bg-white pointer-coarse:min-h-11'
const DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315] as const
const sameGradient = (a: Gradient | undefined, b: Gradient) => Boolean(a) && JSON.stringify(a) === JSON.stringify(b)

/**
 * Isi: a plain colour or a gradient. Gradien has the presets, Linear / Radial, the angle (dial, number, eight
 * directions) and the stops on a bar: click the bar to add one, drag a marker to move it, and per stop its colour
 * and transparency.
 */
export function FillControl({ id, label, fill, onChange }: {
  /** Unique per panel, for the labels. */
  id: string
  label: string
  fill: Fill
  /** `key` bursts (a drag, a slider) amend one history step. */
  onChange: (fill: Fill, key?: string) => void
}) {
  const t = useTranslations('editor.layerEditor')
  const { gradient } = fill
  const [active, setActive] = useState(0)
  const stop = gradient ? gradient.stops[Math.min(active, gradient.stops.length - 1)] : null
  const index = gradient ? Math.min(active, gradient.stops.length - 1) : 0
  const setGradient = (next: Gradient, key?: string) => onChange({ color: next.stops[0].color, gradient: next }, key)
  const setStop = (change: Parameters<typeof updateStop>[2], key?: string) => {
    if (!gradient) return
    const result = updateStop(gradient, index, change)
    setActive(result.index)
    setGradient(result.gradient, key)
  }

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <span id={`${id}-label`} className={LABEL}>{label}</span>
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-0.5 rounded-lg border border-hairline bg-zinc-50 p-0.5">
          {(['color', 'gradient'] as const).map((mode) => {
            const on = mode === 'gradient' ? Boolean(gradient) : !gradient
            return (
              <button key={mode} type="button" role="radio" aria-checked={on}
                onClick={() => {
                  if (on) return
                  if (mode === 'color') onChange({ color: fill.color })
                  else {
                    setActive(0)
                    setGradient(gradientFrom(fill.color))
                  }
                }}
                className={`${SEGMENT} ${on ? 'bg-white text-accent shadow-[0_1px_2px_rgba(23,24,39,0.12)]' : 'text-ink-muted hover:text-ink'}`}>
                {mode === 'gradient' && <span aria-hidden="true" className="size-3.5 rounded-full" style={{ backgroundImage: gradientCss(GRADIENT_PRESETS[1].gradient) }} />}
                {t(mode === 'color' ? 'fill.color' : 'fill.gradient')}
              </button>
            )
          })}
        </div>
      </div>

      {!gradient ? (
        <ColorInput label={t('color')} value={fill.color} onChange={(color) => onChange({ color }, 'color')} />
      ) : (
        <>
          <div>
            <span id={`${id}-presets`} className={LABEL}>{t('fill.presets')}</span>
            <ul aria-labelledby={`${id}-presets`} className="grid max-h-[8.75rem] grid-cols-6 gap-1.5 overflow-y-auto overscroll-contain rounded-lg p-0.5">
              {GRADIENT_PRESETS.map((preset) => {
                const on = sameGradient(gradient, preset.gradient)
                return (
                  <li key={preset.id}>
                    <button type="button" aria-label={t(`gradients.${preset.id}` as 'gradients.brand')} title={t(`gradients.${preset.id}` as 'gradients.brand')} aria-pressed={on}
                      onClick={() => { setActive(0); setGradient(copyGradient(preset.gradient)) }}
                      style={CHECKER}
                      className={`relative block aspect-square w-full overflow-hidden rounded-lg transition-transform hover:scale-[1.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:hover:scale-100 ${
                        on ? 'ring-2 ring-accent ring-offset-1' : 'shadow-[inset_0_0_0_1px_rgba(23,24,39,0.1)]'}`}>
                      <span aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: gradientCss(preset.gradient) }} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div role="radiogroup" aria-label={t('fill.kind')} className="flex gap-0.5 rounded-lg border border-hairline bg-zinc-50 p-0.5">
            {(['linear', 'radial'] as const).map((kind) => (
              <button key={kind} type="button" role="radio" aria-checked={gradient.kind === kind}
                onClick={() => gradient.kind !== kind && setGradient({ ...gradient, kind })}
                className={`${SEGMENT} ${gradient.kind === kind ? 'bg-white text-accent shadow-[0_1px_2px_rgba(23,24,39,0.12)]' : 'text-ink-muted hover:text-ink'}`}>
                <span aria-hidden="true" className="size-3.5 rounded-full border border-current/30"
                  style={{ backgroundImage: kind === 'linear' ? 'linear-gradient(90deg, currentColor, transparent)' : 'radial-gradient(circle, currentColor, transparent 75%)' }} />
                {t(`fill.${kind}`)}
              </button>
            ))}
          </div>

          {gradient.kind === 'linear' && (
            <AngleControl id={id} angle={gradient.angle} onChange={(angle, key) => setGradient({ ...gradient, angle }, key)} />
          )}

          <StopBar gradient={gradient} active={index} onSelect={setActive}
            onMove={(at, offset) => {
              const result = updateStop(gradient, at, { offset })
              setActive(result.index)
              setGradient(result.gradient, 'gradientStop')
            }}
            onAdd={(offset) => {
              const result = addStop(gradient, offset)
              if (result.index < 0) return
              setActive(result.index)
              setGradient(result.gradient)
            }}
            onRemove={(at) => {
              setActive(Math.max(0, at - 1))
              setGradient(removeStop(gradient, at))
            }}
          />

          {stop && (
            <div className="space-y-2 rounded-xl border border-hairline bg-zinc-50/60 p-2.5">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-xs font-semibold text-ink">{t('fill.stop', { index: index + 1, total: gradient.stops.length })}</p>
                <button type="button" onClick={() => {
                  const result = addStop(gradient)
                  if (result.index < 0) return
                  setActive(result.index)
                  setGradient(result.gradient)
                }} disabled={gradient.stops.length >= GRADIENT_LIMITS.stops.max} aria-label={t('fill.addStop')} title={t('fill.addStop')} className={`${SMALL} px-2`}>
                  <Plus size={14} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => { setActive(Math.max(0, index - 1)); setGradient(removeStop(gradient, index)) }}
                  disabled={gradient.stops.length <= GRADIENT_LIMITS.stops.min} aria-label={t('fill.removeStop')} title={t('fill.removeStop')} className={`${SMALL} px-2`}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              <ColorInput label={t('fill.stopColor')} value={stop.color} onChange={(color) => setStop({ color }, 'gradientStop')} />
              <Range id={`${id}-alpha`} label={t('fill.transparency')} min={0} max={100} step={1}
                value={Math.round((1 - stop.alpha) * 100)} display={`${Math.round((1 - stop.alpha) * 100)}%`}
                onChange={(value) => setStop({ alpha: 1 - value / 100 }, 'gradientStop')} />
              <Range id={`${id}-offset`} label={t('fill.position')} min={0} max={100} step={1}
                value={Math.round(stop.offset * 100)} display={`${Math.round(stop.offset * 100)}%`}
                onChange={(value) => setStop({ offset: value / 100 }, 'gradientStop')} />
            </div>
          )}

          <button type="button" onClick={() => onChange({ color: gradient.stops[0].color })} className={`${SMALL} w-full text-red-700 hover:bg-red-50`}>
            <Trash2 size={14} aria-hidden="true" />{t('fill.remove')}
          </button>
        </>
      )}
    </div>
  )
}

/** The gradient over light squares, with a marker per stop: drag to move, click the bar to add, Delete to remove. */
function StopBar({ gradient, active, onSelect, onMove, onAdd, onRemove }: {
  gradient: Gradient
  active: number
  onSelect: (index: number) => void
  onMove: (index: number, offset: number) => void
  onAdd: (offset: number) => void
  onRemove: (index: number) => void
}) {
  const t = useTranslations('editor.layerEditor')
  const bar = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; index: number } | null>(null)
  const offsetAt = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect()
    return rect && rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0
  }
  const flat = { ...gradient, kind: 'linear' as const, angle: 90 }

  function keyOn(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const stop = gradient.stops[index]
    const step = event.shiftKey ? 0.1 : 0.01
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onMove(index, stop.offset - step)
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onMove(index, stop.offset + step)
    else if (event.key === 'Home') onMove(index, 0)
    else if (event.key === 'End') onMove(index, 1)
    else if (event.key === 'Delete' || event.key === 'Backspace') onRemove(index)
    else return
    // The editor's own arrows and Delete would move or delete the layer.
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div>
      <span className={LABEL}>{t('fill.stops')}</span>
      <div className="px-2.5 pt-1 pb-3">
        <div
          ref={bar}
          className="relative h-8 cursor-copy touch-none rounded-lg shadow-[inset_0_0_0_1px_rgba(23,24,39,0.12)]"
          style={CHECKER}
          title={t('fill.barHint')}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget || (event.pointerType === 'mouse' && event.button !== 0)) return
            onAdd(offsetAt(event.clientX))
          }}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg" style={{ backgroundImage: gradientCss(flat) }} />
          {gradient.stops.map((stop, index) => {
            const on = index === active
            return (
              <button
                key={index}
                type="button"
                role="slider"
                aria-label={t('fill.stopLabel', { index: index + 1 })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(stop.offset * 100)}
                aria-valuetext={`${Math.round(stop.offset * 100)}%`}
                onFocus={() => onSelect(index)}
                onKeyDown={(event) => keyOn(event, index)}
                onPointerDown={(event) => {
                  if (event.pointerType === 'mouse' && event.button !== 0) return
                  event.preventDefault()
                  event.currentTarget.focus()
                  onSelect(index)
                  event.currentTarget.setPointerCapture(event.pointerId)
                  drag.current = { pointerId: event.pointerId, index }
                }}
                onPointerMove={(event) => {
                  if (drag.current?.pointerId !== event.pointerId) return
                  onMove(drag.current.index, offsetAt(event.clientX))
                }}
                onPointerUp={() => { drag.current = null }}
                onPointerCancel={() => { drag.current = null }}
                // A marker keeps its index while dragged past another: the list re-sorts, so follow it.
                onLostPointerCapture={() => { drag.current = null }}
                className={`absolute top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center outline-none pointer-coarse:size-11 ${on ? 'z-10' : ''} focus-visible:[&>span]:outline-2 focus-visible:[&>span]:outline-offset-2 focus-visible:[&>span]:outline-accent`}
                style={{ left: `${stop.offset * 100}%` }}
              >
                <span aria-hidden="true" className={`block rounded-full border-2 transition-[width,height] ${on ? 'size-5 border-accent shadow-[0_0_0_2px_white,0_2px_6px_rgba(23,24,39,0.35)]' : 'size-4 border-white shadow-[0_0_0_1px_rgba(23,24,39,0.25),0_1px_3px_rgba(23,24,39,0.3)]'}`}
                  style={{ ...CHECKER, backgroundSize: '6px 6px' }}>
                  <span className="block size-full rounded-full" style={{ background: stopCss(stop) }} />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** The angle: a dial to drag (Shift snaps to 15°), the number, and eight directions. */
function AngleControl({ id, angle, onChange }: { id: string; angle: number; onChange: (angle: number, key?: string) => void }) {
  const t = useTranslations('editor.layerEditor')
  const dial = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  const value = normalAngle(angle)
  function fromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = dial.current?.getBoundingClientRect()
    if (!rect) return
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    if (Math.hypot(dx, dy) < 2) return
    const raw = Math.atan2(dx, -dy) * 180 / Math.PI
    onChange(normalAngle(event.shiftKey ? Math.round(raw / 15) * 15 : raw), 'gradientAngle')
  }
  return (
    <div>
      <label htmlFor={`${id}-angle`} className={LABEL}>{t('fill.angle')}</label>
      <div className="flex items-center gap-3">
        <div
          ref={dial}
          role="slider"
          tabIndex={0}
          aria-label={t('fill.angle')}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={value}
          aria-valuetext={`${value}°`}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 15 : 1
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange(normalAngle(value + step), 'gradientAngle')
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange(normalAngle(value - step), 'gradientAngle')
            else return
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = event.pointerId
            fromPointer(event)
          }}
          onPointerMove={(event) => { if (drag.current === event.pointerId) fromPointer(event) }}
          onPointerUp={() => { drag.current = null }}
          onPointerCancel={() => { drag.current = null }}
          className="relative size-12 shrink-0 cursor-grab touch-none rounded-full border border-hairline bg-white shadow-[inset_0_1px_3px_rgba(23,24,39,0.08)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing"
        >
          <span aria-hidden="true" className="absolute inset-0" style={{ transform: `rotate(${value}deg)` }}>
            <span className="absolute top-1 left-1/2 h-[calc(50%-4px)] w-0.5 -translate-x-1/2 rounded-full bg-accent" />
            <span className="absolute top-0.5 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_0_2px_white]" />
          </span>
          <span aria-hidden="true" className="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-ink-soft" />
        </div>
        <div className="relative w-[4.5rem] shrink-0">
          <input id={`${id}-angle`} type="number" min={0} max={359} step={1} value={value}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (Number.isFinite(next)) onChange(normalAngle(next), 'gradientAngle')
            }}
            className="w-full rounded-lg border border-hairline bg-white py-2 pr-5 pl-2.5 text-sm text-ink tabular-nums focus:border-accent focus:outline-none" />
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-ink-muted">°</span>
        </div>
        <div role="group" aria-label={t('fill.directions')} className="grid min-w-0 flex-1 grid-cols-4 gap-1">
          {DIRECTIONS.map((direction) => (
            <button key={direction} type="button" aria-label={`${direction}°`} title={`${direction}°`} aria-pressed={value === direction}
              onClick={() => onChange(direction)}
              className={`inline-flex h-7 min-w-0 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-10 ${
                value === direction ? 'bg-accent text-white' : 'bg-zinc-100 text-ink-muted hover:bg-zinc-200 hover:text-ink'}`}>
              <ArrowUp size={13} aria-hidden="true" style={{ transform: `rotate(${direction}deg)` }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="min-w-0">
      <span className={LABEL}>{label}</span>
      <label className="relative flex h-10 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-hairline bg-white pr-2.5 pl-1.5 text-xs tabular-nums text-ink focus-within:border-accent hover:border-zinc-300">
        <span aria-hidden="true" className="size-6 shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgba(23,24,39,0.15)]" style={{ background: value }} />
        <span className="truncate">{value.toUpperCase()}</span>
        <input type="color" aria-label={label} title={label} value={value.toLowerCase()}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
    </div>
  )
}

function Range({ id, label, min, max, step, value, display, onChange }: {
  id: string; label: string; min: number; max: number; step: number; value: number; display: string; onChange: (value: number) => void
}) {
  return (
    <div className="min-w-0">
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-ink-muted">{label}</label>
        <output htmlFor={id} className="text-xs font-medium text-ink tabular-nums">{display}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)))
        }}
        className="block h-7 w-full min-w-0 cursor-pointer accent-[var(--color-accent)]" />
    </div>
  )
}

/** Tambah › Overlay gradien: see-through gradients the size of the slide, previewed over the slide itself. */
export function OverlayMenu({ backgroundUrl, disabled, onAdd }: {
  backgroundUrl: string
  disabled: boolean
  onAdd: (preset: GradientPreset) => void
}) {
  const t = useTranslations('editor.layerEditor')
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-soft uppercase">
        <Layers2 size={13} aria-hidden="true" />{t('overlay.title')}
      </h3>
      <p className="mb-2 text-xs leading-relaxed text-ink-muted">{t('overlay.hint')}</p>
      <ul className="grid min-w-0 grid-cols-3 gap-2">
        {OVERLAY_PRESETS.map((preset) => {
          const name = t(`gradients.${preset.id}` as 'gradients.shadeBottom')
          return (
            <li key={preset.id} className="min-w-0">
              <button type="button" disabled={disabled} onClick={() => onAdd(preset)} aria-label={t('overlay.add', { name })}
                className="group block w-full min-w-0 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50">
                <span aria-hidden="true"
                  className="relative block aspect-[4/5] overflow-hidden rounded-xl bg-zinc-200 bg-cover bg-center shadow-[inset_0_0_0_1px_rgba(23,24,39,0.08)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_18px_-10px_rgba(23,24,39,0.5)] group-disabled:translate-y-0 motion-reduce:transition-none"
                  style={{ backgroundImage: `url("${backgroundUrl}")` }}>
                  <span className="absolute inset-0" style={{ backgroundImage: gradientCss(preset.gradient) }} />
                </span>
                <span className="mt-1 block truncate text-[11px] font-medium text-ink-muted group-hover:text-ink">{name}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
