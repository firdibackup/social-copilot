'use client'

import { useTranslations } from 'next-intl'
import { Check, Crop, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { HANDLES, layerImageUrl, type Handle, type ImageLayer } from '@/lib/layer-doc'
import { cropZoom, cropHandle } from './layer-editor-crop-math'
import { imageFullRect, panCrop, resetCrop, zoomCrop } from './layer-editor-gesture'

/** The most the picture zooms in from the slider; the wheel and pinch go up to the crop limit. */
const SLIDER_MAX = 8
const AT: Record<Handle, [number, number]> = {
  nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5],
}
const CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}

/** The crop layer as it should be shown: the doc's layer with the draft's frame and crop. */
export function withCropOf(layer: ImageLayer, draft: ImageLayer): ImageLayer {
  const next: ImageLayer = { ...layer, x: draft.x, y: draft.y, w: draft.w, h: draft.h }
  delete next.crop
  return draft.crop ? { ...next, crop: draft.crop } : next
}

/**
 * Potong: the whole picture ghosted around its frame, the rest of the slide dimmed. Drag the picture to place it,
 * drag the frame's handles to crop, Ctrl/⌘+wheel or a trackpad pinch (the canvas forwards it) or the slider to zoom.
 * Arrow keys on the frame move the picture, + and − zoom.
 */
export function CropOverlay({ layer, scale, label, onChange, fixed = false }: {
  layer: ImageLayer
  scale: number
  label: string
  onChange: (layer: ImageLayer) => void
  /** A bingkai: the frame's box stays put, so no crop handles; the picture still pans and zooms inside it. */
  fixed?: boolean
}) {
  const t = useTranslations('editor.layerEditor')
  const drag = useRef<{ pointerId: number; handle: Handle | null; start: ImageLayer; x: number; y: number } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  // Into crop mode with the keyboard ready (Enter, Esc, arrows), without scrolling the slide.
  useEffect(() => frameRef.current?.focus({ preventScroll: true }), [])
  const full = imageFullRect(layer)
  const cx = layer.x + layer.w / 2
  const cy = layer.y + layer.h / 2
  const rotate = `rotate(${layer.rotation ?? 0}deg)`
  const frame = { left: layer.x * scale, top: layer.y * scale, width: layer.w * scale, height: layer.h * scale, transform: rotate }

  function grab(event: ReactPointerEvent<HTMLElement>, handle: Handle | null) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, handle, start: layer, x: event.clientX, y: event.clientY }
  }
  function follow(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId || scale <= 0) return
    const dx = (event.clientX - current.x) / scale
    const dy = (event.clientY - current.y) / scale
    onChange(current.handle ? cropHandle(current.start, current.handle, dx, dy) : panCrop(current.start, dx, dy))
  }
  const release = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }
  const pointer = { onPointerMove: follow, onPointerUp: release, onPointerCancel: release }

  function keys(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = (event.shiftKey ? 10 : 1) / Math.max(scale, 0.01)
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const move = arrows[event.key]
    if (move) onChange(panCrop(layer, move[0], move[1]))
    else if (event.key === '+' || event.key === '=') onChange(zoomCrop(layer, 1.1))
    else if (event.key === '-' || event.key === '_') onChange(zoomCrop(layer, 1 / 1.1))
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <>
      {/* Clipped to the slide, so the ghost never grows the scroll area: the whole picture, then the dim around the frame. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={layerImageUrl(layer.assetId)}
          alt=""
          draggable={false}
          className="absolute max-w-none select-none"
          style={{
            left: full.x * scale, top: full.y * scale, width: full.w * scale, height: full.h * scale, opacity: layer.opacity ?? 1,
            transform: rotate, transformOrigin: `${(cx - full.x) * scale}px ${(cy - full.y) * scale}px`,
          }}
        />
        <div className="absolute" style={{ ...frame, boxShadow: '0 0 0 100000px rgba(17,18,28,0.55)' }} />
      </div>
      {/* The ghost is grabbable too (within the slide, so a big zoom doesn't grow the scroll area). */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          data-crop-ui=""
          aria-hidden="true"
          className="pointer-events-auto absolute cursor-grab touch-none active:cursor-grabbing"
          style={{
            left: full.x * scale, top: full.y * scale, width: full.w * scale, height: full.h * scale,
            transform: rotate, transformOrigin: `${(cx - full.x) * scale}px ${(cy - full.y) * scale}px`,
          }}
          onPointerDown={(event) => grab(event, null)}
          {...pointer}
        />
      </div>
      <div
        data-crop-ui=""
        role="group"
        tabIndex={0}
        aria-label={`${t('cropping.title')}: ${label}`}
        aria-describedby="layer-crop-hint"
        onKeyDown={keys}
        onPointerDown={(event) => grab(event, null)}
        {...pointer}
        className="absolute cursor-grab touch-none outline-2 outline-white outline-solid focus-visible:outline-accent active:cursor-grabbing"
        style={{ ...frame, boxShadow: '0 0 0 1px rgba(17,18,28,0.35), inset 0 0 0 1px rgba(17,18,28,0.2)' }}
        ref={frameRef}
      >
        {/* Thirds, as a guide. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_calc(33.333%-0.5px),rgba(255,255,255,0.55)_calc(33.333%-0.5px),rgba(255,255,255,0.55)_calc(33.333%+0.5px),transparent_calc(33.333%+0.5px),transparent_calc(66.666%-0.5px),rgba(255,255,255,0.55)_calc(66.666%-0.5px),rgba(255,255,255,0.55)_calc(66.666%+0.5px),transparent_calc(66.666%+0.5px)),linear-gradient(to_bottom,transparent_calc(33.333%-0.5px),rgba(255,255,255,0.55)_calc(33.333%-0.5px),rgba(255,255,255,0.55)_calc(33.333%+0.5px),transparent_calc(33.333%+0.5px),transparent_calc(66.666%-0.5px),rgba(255,255,255,0.55)_calc(66.666%-0.5px),rgba(255,255,255,0.55)_calc(66.666%+0.5px),transparent_calc(66.666%+0.5px))]" />
        {!fixed && HANDLES.map((handle) => {
          const [fx, fy] = AT[handle]
          const side = handle.length === 1
          const horizontal = handle === 'n' || handle === 's'
          return (
            <span
              key={handle}
              role="button"
              tabIndex={-1}
              aria-label={t('handle', { side: t(`handles.${handle}`) })}
              onPointerDown={(event) => grab(event, handle)}
              {...pointer}
              className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center pointer-coarse:size-11"
              style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, cursor: CURSOR[handle] }}
            >
              {side ? (
                <span aria-hidden="true" className={`block rounded-full bg-white shadow-[0_0_0_1px_rgba(17,18,28,0.35),0_1px_4px_rgba(17,18,28,0.45)] ${horizontal ? 'h-1.5 w-6' : 'h-6 w-1.5'}`} />
              ) : (
                // An L bracket on the corner, like a crop tool.
                <span aria-hidden="true" className="relative block size-4 drop-shadow-[0_1px_2px_rgba(17,18,28,0.55)]"
                  style={{ transform: `rotate(${{ nw: 0, ne: 90, se: 180, sw: 270 }[handle as 'nw']}deg)` }}>
                  <span className="absolute top-[5px] left-[5px] h-1.5 w-[15px] rounded-full bg-white" />
                  <span className="absolute top-[5px] left-[5px] h-[15px] w-1.5 rounded-full bg-white" />
                </span>
              )}
            </span>
          )
        })}
      </div>
    </>
  )
}

/** The bar over the canvas while cropping: how, the zoom, Atur ulang and Selesai. */
export function CropBar({ layer, onChange, onDone, onReset, fixed = false }: {
  layer: ImageLayer
  /** A bingkai: the hint says the picture moves inside a fixed frame. */
  fixed?: boolean
  onChange: (layer: ImageLayer) => void
  onDone: () => void
  /** How Atur ulang resets, when not the image's own (a bingkai centres its picture instead). */
  onReset?: (layer: ImageLayer) => ImageLayer
}) {
  const t = useTranslations('editor.layerEditor')
  const zoom = cropZoom(layer)
  const setZoom = (value: number) => onChange(zoomCrop(layer, value / zoom))
  const button = 'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 disabled:text-ink-soft'
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <div data-crop-ui="" className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-hairline bg-white/95 py-1.5 pr-1.5 pl-3 shadow-[0_10px_30px_-12px_rgba(23,24,39,0.45)] backdrop-blur starting:-translate-y-1 starting:opacity-0 transition-[opacity,translate] duration-150 motion-reduce:transition-none">
        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
          <Crop size={14} />
        </span>
        <p id="layer-crop-hint" className="min-w-0 max-w-56 text-xs leading-snug text-ink max-lg:sr-only">{fixed ? t('frames.cropHint') : t('cropping.hint')}</p>
        <label className="flex min-w-0 items-center gap-1.5 text-ink-muted">
          <ZoomOut size={14} aria-hidden="true" className="shrink-0" />
          <span className="sr-only">{t('cropping.zoom')}</span>
          <input
            type="range"
            min={100}
            max={SLIDER_MAX * 100}
            step={1}
            value={Math.round(Math.min(SLIDER_MAX, zoom) * 100)}
            aria-valuetext={`${Math.round(zoom * 100)}%`}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value)) setZoom(value / 100)
            }}
            // Enter and Esc still finish; arrows belong to the slider.
            onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== 'Escape') event.stopPropagation() }}
            className="h-8 w-24 min-w-0 cursor-pointer accent-[var(--color-accent)] sm:w-32"
          />
          <ZoomIn size={14} aria-hidden="true" className="shrink-0" />
        </label>
        <button type="button" onClick={() => onChange((onReset ?? resetCrop)(layer))} disabled={!onReset && !layer.crop} className={`${button} text-ink hover:bg-zinc-100`}>
          <RotateCcw size={14} aria-hidden="true" />
          <span className="max-sm:sr-only">{t('cropping.reset')}</span>
        </button>
        <button type="button" onClick={onDone} className={`${button} bg-accent text-white hover:bg-accent-deep`}>
          <Check size={14} aria-hidden="true" />
          {t('cropping.done')}
        </button>
      </div>
    </div>
  )
}
