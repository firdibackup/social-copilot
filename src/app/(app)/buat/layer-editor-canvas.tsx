'use client'

import { useTranslations } from 'next-intl'
import { Minus, Plus, Scan } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { fontFamilyOf } from '@/components/font-previews'
import type { FontName } from '@/lib/design-styles'
import { layoutText, loadFonts, loadImage, measureContext } from '@/lib/layer-canvas'
import { migrateLayerDoc } from '@/lib/design-doc'
import { drawDesignPage } from '@/lib/design-canvas'
import { fieldReady } from '@/lib/design-fields'
import {
  isOutside, layerImageUrl, normalizePath, pathPointsAbsolute, SNAP_SCREEN_PX,
  type Handle, type Layer, type LayerDoc, type PathLayer, type PathPoint, type TextLayer,
} from '@/lib/layer-doc'
import { fitTextHeights, handlesFor, moveLayer, NO_GUIDES, replaceLayer, resizeRotatedLayer, type Guides } from './layer-editor-gesture'
import { PenLayer, type PenResult } from './layer-editor-pen'

export const familyOf = (font: FontName) => fontFamilyOf(font) ?? 'sans-serif'

/** The lines of a text layer exactly as the export canvas will draw them. */
export const layoutOf = (layer: TextLayer) => layoutText(measureContext(), layer, familyOf(layer.font))

/** Every text box at the height of its lines. */
export const fitDoc = (doc: LayerDoc) => fitTextHeights(doc, (layer) => layoutOf(layer).height)

/** Where each handle sits on the box, as fractions of its width and height. */
const HANDLE_AT: Record<Handle, [number, number]> = {
  nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5],
}
const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}

/** A path point (or one of its bezier handles) being dragged. */
interface PointGrab { index: number; part: 'anchor' | 'in' | 'out' }

/**
 * A path layer with one point (or handle) moved by (dx, dy) canvas px in the layer's own, unrotated frame, its box
 * refitted to the new extent. A rotated layer's box is shifted so the points that didn't move stay where they are on
 * screen. Null when the result isn't a valid path (a handle dragged too far out).
 */
export function movePathPoint(layer: PathLayer, grab: PointGrab, dx: number, dy: number): PathLayer | null {
  const points = pathPointsAbsolute(layer)
  const point = points[grab.index]
  if (!point) return null
  const shift = (vector: { x: number; y: number }) => ({ x: vector.x + dx, y: vector.y + dy })
  points[grab.index] = grab.part === 'anchor'
    ? { ...shift(point), ...(point.in ? { in: shift(point.in) } : {}), ...(point.out ? { out: shift(point.out) } : {}) }
    : { ...point, [grab.part]: shift(point[grab.part] ?? point) }
  const normal = normalizePath(points, layer.closed)
  if (!normal) return null
  const angle = (layer.rotation ?? 0) * Math.PI / 180
  // Rotation turns about the box centre: keep the old centre's frame by moving the box with its centre's drift.
  const ox = normal.box.x + normal.box.w / 2 - (layer.x + layer.w / 2)
  const oy = normal.box.y + normal.box.h / 2 - (layer.y + layer.h / 2)
  const sx = ox * Math.cos(angle) - oy * Math.sin(angle) - ox
  const sy = ox * Math.sin(angle) + oy * Math.cos(angle) - oy
  return { ...layer, ...normal.box, x: normal.box.x + sx, y: normal.box.y + sy, points: normal.points }
}

interface Gesture {
  id: string
  handle: Handle | null
  point?: PointGrab
  start: Layer
  x: number
  y: number
  pointerId: number
  moved: boolean
}

export type BaseTone = 'light' | 'dark'

interface LayerCanvasProps {
  doc: LayerDoc
  baseAssetId: string
  selectedId: string | null
  readOnly: boolean
  labelOf: (layer: Layer) => string
  onSelect: (id: string | null) => void
  /** The end of one drag or resize: a single history step. */
  onCommit: (doc: LayerDoc) => void
  /** A double click on a text layer: type into it. */
  onEditText: (id: string) => void
  /** Whether the background is mostly light, for the colour of new text. */
  onBaseTone: (tone: BaseTone) => void
  /** Bentuk bebas: the canvas takes points instead of selecting layers. */
  drawing?: boolean
  /** The pen finished (absolute canvas points) or was cancelled (null). */
  onDrawEnd?: (result: PenResult | null) => void
}

/**
 * The slide at its own pixel size, scaled to fit with CSS. Layers are drawn in a scaled layer; the hit areas,
 * selection frame, handles and guides sit in screen px above it, so handles keep their size at any zoom.
 */
export function LayerCanvas({
  doc, baseAssetId, selectedId, readOnly, labelOf, onSelect, onCommit, onEditText, onBaseTone, drawing = false, onDrawEnd,
}: LayerCanvasProps) {
  const t = useTranslations('editor.layerEditor')
  const areaRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLImageElement>(null)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [baseLoaded, setBaseLoaded] = useState(false)
  const [zoom, setZoom] = useState<number | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const liveRef = useRef<{ doc: LayerDoc; guides: Guides } | null>(null)
  const [live, setLiveState] = useState<{ doc: LayerDoc; guides: Guides } | null>(null)
  const setLive = (next: { doc: LayerDoc; guides: Guides } | null) => {
    liveRef.current = next
    setLiveState(next)
  }
  // Where the pen's bar goes: over the canvas area, outside the scroller.
  const [barHost, setBarHost] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = areaRef.current
    if (!node) return
    const measure = () => {
      const rect = node.getBoundingClientRect()
      setArea((current) => (current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height }))
    }
    // Measured now as well as on resize: a missed first observation would leave the slide unscaled and unseen.
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // A cached background can finish before React attaches onLoad; then it would stay hidden.
  useEffect(() => {
    const image = baseRef.current
    if (image?.complete && image.naturalWidth > 0 && !baseLoaded) measureTone(image)
  })

  const padding = area.width < 600 ? 24 : 64
  const fitScale = area.width > 0 && area.height > 0 ? Math.min(Math.max(1, area.width - 40) / doc.width, Math.max(1, area.height - padding) / doc.height) : 0
  const scale = zoom ?? fitScale
  const changeZoom = (factor: number) => setZoom(Math.min(8, Math.max(0.05, scale * factor)))
  const shown = live?.doc ?? doc
  const selected = shown.layers.find((layer) => layer.id === selectedId) ?? null

  function start(event: ReactPointerEvent<HTMLElement>, id: string, handle: Handle | null, point?: PointGrab) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.stopPropagation()
    onSelect(id)
    if (readOnly) return
    const layer = doc.layers.find((item) => item.id === id)
    if (!layer) return
    if (layer.locked || layer.hidden) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { id, handle, point, start: layer, x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false }
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId || scale === 0) return
    const sx = event.clientX - current.x
    const sy = event.clientY - current.y
    // A tap selects; only a real drag moves.
    if (!current.moved && Math.hypot(sx, sy) < 3) return
    current.moved = true
    const dx = sx / scale
    const dy = sy / scale
    if (current.point && current.start.kind === 'path') {
      // The drag in the layer's own frame: undo its rotation.
      const angle = (current.start.rotation ?? 0) * Math.PI / 180
      const next = movePathPoint(current.start, current.point,
        dx * Math.cos(angle) + dy * Math.sin(angle), -dx * Math.sin(angle) + dy * Math.cos(angle))
      if (next) setLive({ doc: replaceLayer(doc, next), guides: NO_GUIDES })
      return
    }
    if (current.handle) {
      setLive({ doc: fitDoc(replaceLayer(doc, resizeRotatedLayer(current.start, current.handle, dx, dy))), guides: NO_GUIDES })
      return
    }
    const others = doc.layers.filter((layer) => layer.id !== current.id && !layer.hidden)
    const next = moveLayer(current.start, dx, dy, doc, others, SNAP_SCREEN_PX / scale)
    setLive({ doc: replaceLayer(doc, next.layer), guides: next.guides })
  }

  function end(event: ReactPointerEvent<HTMLElement>, keep: boolean) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    gesture.current = null
    const result = liveRef.current
    setLive(null)
    if (keep && current.moved && result) onCommit(result.doc)
  }

  function measureTone(image: HTMLImageElement) {
    setBaseLoaded(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 8
      canvas.height = 8
      const context = canvas.getContext('2d')
      if (!context) return
      context.drawImage(image, 0, 0, 8, 8)
      const data = context.getImageData(0, 0, 8, 8).data
      let sum = 0
      for (let index = 0; index < data.length; index += 4) sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
      onBaseTone(sum / 64 > 150 ? 'light' : 'dark')
    } catch {
      // A tainted canvas only costs the guess; new text stays white.
    }
  }

  const box = (layer: Layer) => ({ left: layer.x * scale, top: layer.y * scale, width: layer.w * scale, height: layer.h * scale,
    transform: `rotate(${layer.rotation ?? 0}deg)` })

  const editingPath = !readOnly && !drawing && selected?.kind === 'path' && !selected.locked && !selected.hidden ? selected : null

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
    {drawing && <div ref={setBarHost} className="contents" />}
    <div
      ref={areaRef}
      className="relative min-h-0 flex-1 overflow-auto overscroll-contain"
      tabIndex={0}
      role="region"
      aria-label={t('canvas')}
      // A press anywhere around the slide lets go of the selection; presses on a layer or handle stop in start().
      // While drawing, a press off the slide does nothing: the outline stays and so does the selection.
      onPointerDown={(event) => {
        if (drawing || (event.pointerType === 'mouse' && event.button !== 0)) return
        onSelect(null)
      }}
      onKeyDown={(event) => {
        if (event.shiftKey && event.key === '!' && !(event.target as HTMLElement).closest('input, textarea, [contenteditable]')) {
          event.preventDefault()
          setZoom(null)
        }
      }}
    >
      {scale > 0 && (
        <div style={{ minWidth: '100%', minHeight: '100%', width: doc.width * scale + 40, height: doc.height * scale + 40 }} className="flex items-center justify-center p-5">
        <div
          className="relative shadow-[0_18px_50px_-18px_rgba(23,24,39,0.45),0_0_0_1px_rgba(23,24,39,0.06)]"
          style={{ width: doc.width * scale, height: doc.height * scale }}
        >
          {/* What gets saved, at the doc's own pixel size. */}
          <div
            aria-hidden="true"
            className={`absolute top-0 left-0 origin-top-left overflow-hidden bg-zinc-100 select-none ${baseLoaded ? '' : 'shimmer'}`}
            style={{ width: doc.width, height: doc.height, transform: `scale(${scale})` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={baseRef}
              src={layerImageUrl(baseAssetId)}
              alt=""
              draggable={false}
              onError={() => setBaseLoaded(true)}
              onLoad={(event) => measureTone(event.currentTarget)}
              className={`absolute inset-0 size-full max-w-none transition-opacity duration-300 ${baseLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
            <DocumentCanvas doc={shown} baseAssetId={baseAssetId} />
          </div>

          {/* Hit areas, frame and handles, in screen px. */}
          <div
            role="group"
            aria-label={t('canvas')}
            className="absolute inset-0 touch-none"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) onSelect(null)
            }}
            onPointerMove={move}
            onPointerUp={(event) => end(event, true)}
            onPointerCancel={(event) => end(event, false)}
          >
            {shown.layers.filter((layer) => !layer.hidden).map((layer) => (
              <div
                key={layer.id}
                role="button"
                tabIndex={0}
                aria-label={labelOf(layer)}
                aria-pressed={layer.id === selectedId}
                onPointerDown={(event) => start(event, layer.id, null)}
                onFocus={() => onSelect(layer.id)}
                onDoubleClick={() => !layer.locked && layer.kind === 'text' && onEditText(layer.id)}
                className={`absolute touch-none rounded-[1px] outline-none hover:outline hover:outline-1 hover:outline-accent/70 focus-visible:outline-2 focus-visible:outline-accent ${readOnly ? '' : 'cursor-move'}`}
                style={{ ...box(layer), ...(layer.field && layer.field.mode !== 'static'
                  ? { border: `1.5px dashed ${fieldReady(layer.field) ? '#15803d' : '#b91c1c'}` } : {}) }}
              />
            ))}

            {live?.guides.vertical.map((x) => (
              <span key={`v${x}`} aria-hidden="true" className="pointer-events-none absolute -top-3 -bottom-3 w-px bg-[#ff3d9a]" style={{ left: x * scale }} />
            ))}
            {live?.guides.horizontal.map((y) => (
              <span key={`h${y}`} aria-hidden="true" className="pointer-events-none absolute -right-3 -left-3 h-px bg-[#ff3d9a]" style={{ top: y * scale }} />
            ))}

            {selected && !selected.hidden && (
              <div
                className={`absolute touch-none ${readOnly ? 'pointer-events-none' : 'cursor-move'} ${
                  isOutside(selected, doc) ? 'outline-[1.5px] outline-amber-500 outline-dashed' : 'outline-[1.5px] outline-accent outline-solid'
                }`}
                style={box(selected)}
                onPointerDown={(event) => start(event, selected.id, null)}
                onDoubleClick={() => !selected.locked && selected.kind === 'text' && onEditText(selected.id)}
              >
                {!readOnly && !selected.locked && handlesFor(selected).map((handle) => {
                  const [fx, fy] = HANDLE_AT[handle]
                  const side = handle.length === 1
                  return (
                    <span
                      key={handle}
                      role="button"
                      tabIndex={-1}
                      aria-label={t('handle', { side: t(`handles.${handle}`) })}
                      onPointerDown={(event) => start(event, selected.id, handle)}
                      className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center pointer-coarse:size-11"
                      style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, cursor: HANDLE_CURSOR[handle] }}
                    >
                      <span
                        aria-hidden="true"
                        className={`block border-[1.5px] border-accent bg-white shadow-[0_1px_3px_rgba(23,24,39,0.35)] ${
                          side ? (handle === 'e' || handle === 'w' ? 'h-4 w-1.5 rounded-full' : 'h-1.5 w-4 rounded-full') : 'size-3 rounded-full'
                        }`}
                      />
                    </span>
                  )
                })}
              </div>
            )}

            {editingPath && (
              <PathHandles
                layer={editingPath}
                scale={scale}
                label={(index) => t('pathPoint', { index: index + 1 })}
                handleLabel={(index) => t('pathHandle', { index: index + 1 })}
                onGrab={(event, grab) => start(event, editingPath.id, null, grab)}
              />
            )}

            {drawing && (
              <PenLayer scale={scale} width={doc.width} height={doc.height} barHost={barHost} onDone={(result) => onDrawEnd?.(result)} />
            )}
          </div>
        </div>
        </div>
      )}
    </div>
    <div role="group" aria-label={t('zoom')} className="flex h-11 shrink-0 items-center justify-center gap-1 border-t border-hairline bg-white">
      <button type="button" aria-label={t('zoomOut')} disabled={scale <= 0.05} onClick={() => changeZoom(1 / 1.25)} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-zinc-100 disabled:text-ink-soft"><Minus size={16} aria-hidden="true" /></button>
      <select aria-label={t('zoom')} value={zoom === null ? 'fit' : String(zoom)} className="h-9 rounded-md border border-hairline bg-white px-2 text-xs tabular-nums"
        onChange={(event) => setZoom(event.target.value === 'fit' ? null : Number(event.target.value))}>
        <option value="fit">{t('fitPage')}</option>
        {zoom !== null && ![0.05, 0.25, 0.5, 1, 2, 4, 8].includes(zoom) && <option value={zoom}>{Math.round(zoom * 100)}%</option>}
        {[0.05, 0.25, 0.5, 1, 2, 4, 8].map((value) => <option key={value} value={value}>{value * 100}%</option>)}
      </select>
      <button type="button" aria-label={t('zoomIn')} disabled={scale >= 8} onClick={() => changeZoom(1.25)} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-zinc-100 disabled:text-ink-soft"><Plus size={16} aria-hidden="true" /></button>
      <button type="button" aria-label={t('fitPage')} title={`${t('fitPage')} (Shift+1)`} onClick={() => setZoom(null)} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-zinc-100"><Scan size={16} aria-hidden="true" /></button>
    </div>
    </div>
  )
}

/**
 * A selected path's anchors (squares) and curve handles (dots on a stem), drawn in the layer's rotated frame in
 * screen px. Dragging one reshapes the path; the box refits when the drag ends (one history step).
 */
function PathHandles({ layer, scale, label, handleLabel, onGrab }: {
  layer: PathLayer
  scale: number
  label: (index: number) => string
  handleLabel: (index: number) => string
  onGrab: (event: ReactPointerEvent<HTMLElement>, grab: PointGrab) => void
}) {
  const points = pathPointsAbsolute(layer)
  const at = (vector: { x: number; y: number }) => ({ left: (vector.x - layer.x) * scale, top: (vector.y - layer.y) * scale })
  const hit = 'absolute flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-crosshair touch-none items-center justify-center pointer-coarse:size-11'
  const stem = (from: PathPoint, to: { x: number; y: number }) => (
    <line x1={(from.x - layer.x) * scale} y1={(from.y - layer.y) * scale} x2={(to.x - layer.x) * scale} y2={(to.y - layer.y) * scale}
      stroke="var(--color-accent)" strokeWidth={1} />
  )
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: layer.x * scale, top: layer.y * scale, width: layer.w * scale, height: layer.h * scale, transform: `rotate(${layer.rotation ?? 0}deg)` }}
    >
      <svg aria-hidden="true" className="absolute top-0 left-0 overflow-visible" width={1} height={1}>
        {points.map((point, index) => (
          <g key={index}>
            {point.in && stem(point, point.in)}
            {point.out && stem(point, point.out)}
          </g>
        ))}
      </svg>
      {points.map((point, index) => (
        <span key={index} className="contents">
          {(['in', 'out'] as const).map((part) => point[part] && (
            <span key={part} role="button" tabIndex={-1} aria-label={handleLabel(index)}
              onPointerDown={(event) => onGrab(event, { index, part })}
              className={`${hit} pointer-events-auto`} style={at(point[part])}>
              <span aria-hidden="true" className="block size-2 rounded-full bg-accent shadow-[0_0_0_1.5px_white]" />
            </span>
          ))}
          <span role="button" tabIndex={-1} aria-label={label(index)}
            onPointerDown={(event) => onGrab(event, { index, part: 'anchor' })}
            className={`${hit} pointer-events-auto`} style={at(point)}>
            <span aria-hidden="true" className="block size-2.5 rounded-[2px] border-[1.5px] border-accent bg-white shadow-[0_1px_3px_rgba(23,24,39,0.35)]" />
          </span>
        </span>
      ))}
    </div>
  )
}

/** Editor and export draw through the same node renderer; DOM remains only for accessible controls. */
function DocumentCanvas({ doc, baseAssetId }: { doc: LayerDoc; baseAssetId: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const images = useRef(new Map<string, Promise<HTMLImageElement>>())
  const [failed, setFailed] = useState(false)
  const t = useTranslations('editor.layerEditor')
  useEffect(() => {
    let live = true
    const ids = [...new Set([baseAssetId, ...doc.layers.flatMap(layer => layer.kind === 'image' && !layer.hidden ? [layer.assetId] : [])])]
    const loaded = ids.map(id => {
      let promise = images.current.get(id)
      if (!promise) {
        promise = loadImage(layerImageUrl(id)).catch(error => { images.current.delete(id); throw error })
        images.current.set(id, promise)
      }
      return promise.then(image => [id, { image, width: image.naturalWidth, height: image.naturalHeight }] as const)
    })
    void Promise.all([Promise.all(loaded), loadFonts(doc, familyOf)]).then(([sources]) => {
      if (!live) return
      const canvas = ref.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) throw new Error('canvas_unavailable')
      const design = migrateLayerDoc(doc, { id: crypto.randomUUID(), pageId: crypto.randomUUID(),
        nodeIds: doc.layers.map(() => crypto.randomUUID()) }, baseAssetId)
      drawDesignPage(context, design.pages[0], new Map(sources), familyOf)
      setFailed(false)
    }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [doc, baseAssetId])
  return <>
    <canvas ref={ref} width={doc.width} height={doc.height} className="absolute inset-0 max-w-none" />
    {failed && <p role="alert" className="absolute inset-x-0 top-0 bg-white p-4 text-red-700">{t('renderFailed')}</p>}
  </>
}
