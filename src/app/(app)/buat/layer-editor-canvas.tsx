'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { fontFamilyOf } from '@/components/font-previews'
import type { FontName } from '@/lib/design-styles'
import { layoutText, measureContext, textCss } from '@/lib/layer-canvas'
import {
  isOutside, layerImageUrl, lineBox, SNAP_SCREEN_PX,
  type Handle, type Layer, type LayerDoc, type TextLayer,
} from '@/lib/layer-doc'
import { fitTextHeights, handlesFor, moveLayer, NO_GUIDES, replaceLayer, resizeLayer, type Guides } from './layer-editor-gesture'

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

interface Gesture {
  id: string
  handle: Handle | null
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
}

/**
 * The slide at its own pixel size, scaled to fit with CSS. Layers are drawn in a scaled layer; the hit areas,
 * selection frame, handles and guides sit in screen px above it, so handles keep their size at any zoom.
 */
export function LayerCanvas({ doc, baseAssetId, selectedId, readOnly, labelOf, onSelect, onCommit, onEditText, onBaseTone }: LayerCanvasProps) {
  const t = useTranslations('editor.layerEditor')
  const areaRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLImageElement>(null)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [baseLoaded, setBaseLoaded] = useState(false)
  const gesture = useRef<Gesture | null>(null)
  const liveRef = useRef<{ doc: LayerDoc; guides: Guides } | null>(null)
  const [live, setLiveState] = useState<{ doc: LayerDoc; guides: Guides } | null>(null)
  const setLive = (next: { doc: LayerDoc; guides: Guides } | null) => {
    liveRef.current = next
    setLiveState(next)
  }

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

  const scale = area.width > 0 && area.height > 0 ? Math.min(area.width / doc.width, area.height / doc.height) : 0
  const shown = live?.doc ?? doc
  const selected = shown.layers.find((layer) => layer.id === selectedId) ?? null

  function start(event: ReactPointerEvent<HTMLElement>, id: string, handle: Handle | null) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.stopPropagation()
    onSelect(id)
    if (readOnly) return
    const layer = doc.layers.find((item) => item.id === id)
    if (!layer) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { id, handle, start: layer, x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false }
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
    if (current.handle) {
      setLive({ doc: fitDoc(replaceLayer(doc, resizeLayer(current.start, current.handle, dx, dy))), guides: NO_GUIDES })
      return
    }
    const others = doc.layers.filter((layer) => layer.id !== current.id)
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

  const box = (layer: Layer) => ({ left: layer.x * scale, top: layer.y * scale, width: layer.w * scale, height: layer.h * scale })

  return (
    <div
      ref={areaRef}
      className="relative flex min-h-0 flex-1 items-center justify-center"
    >
      {scale > 0 && (
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
            {shown.layers.map((layer) =>
              layer.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={layer.id}
                  src={layerImageUrl(layer.assetId)}
                  alt=""
                  draggable={false}
                  className="absolute max-w-none"
                  style={{ left: layer.x, top: layer.y, width: layer.w, height: layer.h, opacity: layer.opacity ?? 1 }}
                />
              ) : (
                <TextView key={layer.id} layer={layer} />
              ),
            )}
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
            {shown.layers.map((layer) => (
              <div
                key={layer.id}
                role="button"
                tabIndex={0}
                aria-label={labelOf(layer)}
                aria-pressed={layer.id === selectedId}
                onPointerDown={(event) => start(event, layer.id, null)}
                onFocus={() => onSelect(layer.id)}
                onDoubleClick={() => layer.kind === 'text' && onEditText(layer.id)}
                className={`absolute touch-none rounded-[1px] outline-none hover:outline hover:outline-1 hover:outline-accent/70 focus-visible:outline-2 focus-visible:outline-accent ${readOnly ? '' : 'cursor-move'}`}
                style={box(layer)}
              />
            ))}

            {live?.guides.vertical.map((x) => (
              <span key={`v${x}`} aria-hidden="true" className="pointer-events-none absolute -top-3 -bottom-3 w-px bg-[#ff3d9a]" style={{ left: x * scale }} />
            ))}
            {live?.guides.horizontal.map((y) => (
              <span key={`h${y}`} aria-hidden="true" className="pointer-events-none absolute -right-3 -left-3 h-px bg-[#ff3d9a]" style={{ top: y * scale }} />
            ))}

            {selected && (
              <div
                className={`absolute touch-none ${readOnly ? 'pointer-events-none' : 'cursor-move'} ${
                  isOutside(selected, doc) ? 'outline-[1.5px] outline-amber-500 outline-dashed' : 'outline-[1.5px] outline-accent outline-solid'
                }`}
                style={box(selected)}
                onPointerDown={(event) => start(event, selected.id, null)}
                onDoubleClick={() => selected.kind === 'text' && onEditText(selected.id)}
              >
                {!readOnly && handlesFor(selected).map((handle) => {
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
          </div>
        </div>
      )}
    </div>
  )
}

/** A text layer as lines placed where the export canvas puts them; never HTML. */
function TextView({ layer }: { layer: TextLayer }) {
  const { lines } = layoutOf(layer)
  const height = lineBox(layer)
  // React warns when the `textDecoration` shorthand changes beside its longhands: use the line longhand.
  const { textDecoration, ...css } = textCss(layer, familyOf(layer.font))
  css.textDecorationLine = textDecoration
  return (
    <div className="absolute" style={{ left: layer.x, top: layer.y, width: layer.w, height: layer.h }}>
      {lines.map((line, index) =>
        line.text ? (
          <span
            key={index}
            className="absolute"
            style={{
              ...css,
              left: line.x - layer.x,
              top: line.top - layer.y,
              height,
              lineHeight: `${height}px`,
              fontKerning: 'normal',
              color: layer.color,
            }}
          >
            {line.text}
          </span>
        ) : null,
      )}
    </div>
  )
}
