'use client'

import { useTranslations } from 'next-intl'
import { Frame as FrameGlyph, ImagePlus, Keyboard, Minus, Plus, Scan, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import {
  useEffect, useEffectEvent, useLayoutEffect, useRef, useState,
  type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import { fontFamilyOf } from '@/components/font-previews'
import type { FontName } from '@/lib/design-styles'
import { layoutText, loadFonts, loadImage, measureContext } from '@/lib/layer-canvas'
import { migrateLayerDoc } from '@/lib/design-doc'
import { drawDesignPage } from '@/lib/design-canvas'
import { fieldReady } from '@/lib/design-fields'
import { shapeFillRule, traceShape } from '@/lib/shape-paths'
import {
  frameAt, layerAssetId, layerImageUrl, normalizePath, pathPointsAbsolute, SNAP_SCREEN_PX,
  type Handle, type ImageLayer, type Layer, type LayerDoc, type PathLayer, type PathPoint, type TextLayer,
} from '@/lib/layer-doc'
import { CropBar, CropOverlay } from './layer-editor-crop'
import { clipImageOf, dragHasImage, dropLayerIntoFrame, type ClipImage } from './layer-editor-frame-math'
import { EmptyFrameMark } from './layer-editor-frame-marks'
import { fitTextHeights, handlesFor, moveLayer, NO_GUIDES, replaceLayer, resizeRotatedLayer, zoomCrop, type Guides } from './layer-editor-gesture'
import { PenLayer, type PenResult } from './layer-editor-pen'
import { SvgPathRecorder } from './layer-editor-shapes'
import {
  clampZoom, comboTitle, comboTokens, isTyping, scrollToKeep, SHORTCUT_HELP, shortcutFor, slidePointAt, useIsMac,
  WORD_KEYS, wheelZoomFactor, ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS, zoomStep, type WordKey,
} from './layer-editor-shortcuts'

/** A fixed scale, or one that follows the area: the whole slide ('fit') or its full width ('fill'). */
type ZoomMode = number | 'fit' | 'fill'

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
  /** The latest drag, in canvas px, so Shift pressed or let go mid-resize can redo it at once. */
  dx: number
  dy: number
  /** Shift: an image resizes freely (stretched) instead of in proportion or by cropping. */
  free: boolean
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
  /**
   * Potong: the image layer being cropped, as it is so far (`doc` already shows it). The slide's layers can't be
   * picked meanwhile; the picture and the frame's handles take the pointer.
   */
  cropping?: ImageLayer | null
  onCropChange?: (layer: ImageLayer) => void
  /** A double click on an image layer: crop it. */
  onCropStart?: (id: string) => void
  /** Selesai: Enter, Esc (the editor's), the bar's button or a press outside the picture. */
  onCropEnd?: () => void
  /**
   * Cropping a frame's picture: the frame's box is fixed (no crop handles) and Atur ulang centres the picture again
   * instead of uncropping it.
   */
  cropFixed?: boolean
  onCropReset?: (layer: ImageLayer) => ImageLayer
  /** A double click on an empty frame: pick a picture for it. */
  onFillFrame?: (id: string) => void
  /** An image file dropped from the device: into the frame under it (`frameId`), else as a new layer. */
  onDropImage?: (image: ClipImage, frameId: string | null) => void
}

/**
 * The slide at its own pixel size, scaled to fit with CSS. Layers are drawn in a scaled layer; the hit areas,
 * selection frame, handles and guides sit in screen px above it, so handles keep their size at any zoom.
 */
export function LayerCanvas({
  doc, baseAssetId, selectedId, readOnly, labelOf, onSelect, onCommit, onEditText, onBaseTone, drawing = false, onDrawEnd,
  cropping = null, onCropChange, onCropStart, onCropEnd, cropFixed = false, onCropReset, onFillFrame, onDropImage,
}: LayerCanvasProps) {
  const t = useTranslations('editor.layerEditor')
  const areaRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLImageElement>(null)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const [baseLoaded, setBaseLoaded] = useState(false)
  const [zoom, setZoom] = useState<ZoomMode>('fit')
  /** The slide point to keep under the cursor (or centre) once a zoom renders, and the scale it's heading to. */
  const anchor = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null)
  const pendingScale = useRef<number | null>(null)
  const pan = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const pinch = useRef<{ distance: number; scale: number; px: number; py: number } | null>(null)
  const mac = useIsMac()
  const gesture = useRef<Gesture | null>(null)
  const liveRef = useRef<{ doc: LayerDoc; guides: Guides } | null>(null)
  const [live, setLiveState] = useState<{ doc: LayerDoc; guides: Guides } | null>(null)
  const slideRef = useRef<HTMLDivElement>(null)
  /** An image being resized from a handle: shows the Shift hint, and whether it's free right now. */
  const [resizing, setResizing] = useState<{ free: boolean; corner: boolean } | null>(null)
  const setLive = (next: { doc: LayerDoc; guides: Guides } | null) => {
    liveRef.current = next
    setLiveState(next)
  }
  // Where the pen's bar goes: over the canvas area, outside the scroller.
  const [barHost, setBarHost] = useState<HTMLDivElement | null>(null)
  /** The frame a dragged picture (a layer or a file from the device) would fill if let go now. */
  const [dropFrame, setDropFrame] = useState<string | null>(null)
  /** A file from the device is being dragged over the canvas. */
  const [fileOver, setFileOver] = useState(false)

  /** Crop mode: the canvas point (px) under a client point. */
  const canvasPoint = (x: number, y: number) => {
    const rect = slideRef.current?.getBoundingClientRect()
    return rect && scale > 0 ? { x: (x - rect.left) / scale, y: (y - rect.top) / scale } : undefined
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

  const padding = area.width < 600 ? 24 : 64
  const measured = area.width > 0 && area.height > 0
  const fitScale = measured ? Math.min(Math.max(1, area.width - 40) / doc.width, Math.max(1, area.height - padding) / doc.height) : 0
  // Fill width: the slide as wide as the area; it then scrolls down, so leave room for a scrollbar.
  const fillWidth = Math.max(1, area.width - 40)
  const fillScale = measured ? (doc.height * fillWidth / doc.width + 40 > area.height ? Math.max(1, fillWidth - 16) : fillWidth) / doc.width : 0
  const scale = zoom === 'fit' ? fitScale : zoom === 'fill' ? fillScale : zoom
  const minScale = Math.min(ZOOM_MIN, fitScale || ZOOM_MIN)

  /**
   * Zooms to a scale or mode, keeping the slide point under `at` (client px; the viewport's centre by default)
   * where it is. Several wheel events can land before React renders: they build on the pending scale and keep the
   * first event's anchor, which is the one measured against what's on screen.
   */
  function zoomTo(next: ZoomMode, at?: { x: number; y: number }) {
    const node = areaRef.current
    const target = next === 'fit' ? fitScale : next === 'fill' ? fillScale : clampZoom(next, minScale)
    const base = pendingScale.current ?? scale
    if (!node || base <= 0 || !Number.isFinite(target)) return
    setZoom(typeof next === 'number' ? target : next)
    if (Math.abs(target - scale) < 1e-4) {
      // Back where it is on screen: nothing will render, so nothing to re-anchor.
      anchor.current = null
      pendingScale.current = null
      return
    }
    if (Math.abs(target - base) < 1e-4) return
    const rect = node.getBoundingClientRect()
    const sx = at ? at.x - rect.left : node.clientWidth / 2
    const sy = at ? at.y - rect.top : node.clientHeight / 2
    anchor.current ??= {
      px: slidePointAt(node.scrollLeft, sx, node.clientWidth, doc.width, base),
      py: slidePointAt(node.scrollTop, sy, node.clientHeight, doc.height, base),
      sx, sy,
    }
    pendingScale.current = target
  }
  const zoomStepTo = (direction: 1 | -1) => zoomTo(zoomStep(scale, direction))

  // After a zoom renders: scroll so the anchored point is back under the cursor (or centre).
  useLayoutEffect(() => {
    const node = areaRef.current
    const point = anchor.current
    anchor.current = null
    pendingScale.current = null
    if (!node || !point || scale <= 0) return
    node.scrollLeft = scrollToKeep(point.px, point.sx, node.clientWidth, doc.width, scale)
    node.scrollTop = scrollToKeep(point.py, point.sy, node.clientHeight, doc.height, scale)
  }, [scale, doc.width, doc.height])

  // ⌘/Ctrl+wheel and a trackpad pinch (Chrome, Edge and Firefox send it as ctrl+wheel; Safari as gesture events)
  // zoom at the cursor. Anywhere in the editor, so the page itself never zooms; a plain wheel scrolls as usual.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    // Safari pinches through gesture events; don't count the same pinch twice.
    if (event.timeStamp - gestureAt.current < 150) return
    // Cropping: the pinch or ⌘+wheel zooms the picture inside its frame, about the cursor.
    if (cropping && areaRef.current?.contains(event.target as Node)) {
      onCropChange?.(zoomCrop(cropping, wheelZoomFactor(event.deltaY, event.deltaMode, areaRef.current?.clientHeight), canvasPoint(event.clientX, event.clientY)))
      return
    }
    const base = pendingScale.current ?? scale
    const inside = areaRef.current?.contains(event.target as Node)
    zoomTo(base * wheelZoomFactor(event.deltaY, event.deltaMode, areaRef.current?.clientHeight), inside ? { x: event.clientX, y: event.clientY } : undefined)
  })
  const gestureBase = useRef(0)
  const gestureAt = useRef(-Infinity)
  const onGesture = useEffectEvent((event: Event & { scale?: number; clientX?: number; clientY?: number }) => {
    if (!rootRef.current?.contains(event.target as Node)) return
    event.preventDefault()
    // On iPhone and iPad the touch handler below already follows the fingers.
    if (pinch.current) return
    gestureAt.current = event.timeStamp
    if (cropping) {
      // Safari's pinch while cropping: each change zooms the picture by how much the fingers moved since the last.
      if (event.type === 'gesturestart') gestureBase.current = 1
      else if (event.type === 'gesturechange' && event.scale && gestureBase.current > 0) {
        const at = event.clientX === undefined ? undefined : canvasPoint(event.clientX, event.clientY ?? 0)
        onCropChange?.(zoomCrop(cropping, event.scale / gestureBase.current, at))
        gestureBase.current = event.scale
      }
      return
    }
    if (event.type === 'gesturestart') gestureBase.current = scale
    else if (event.type === 'gesturechange' && event.scale && gestureBase.current > 0) {
      zoomTo(gestureBase.current * event.scale, event.clientX === undefined ? undefined : { x: event.clientX, y: event.clientY ?? 0 })
    }
  })
  // Zoom keys work even while typing (the browser would zoom the page); Space (held) pans.
  const onDocumentKey = useEffectEvent((event: KeyboardEvent) => {
    // Shift pressed or let go mid-resize: proportional ↔ free at once, without moving the pointer.
    if (event.key === 'Shift' && gesture.current?.handle && !event.repeat) {
      gesture.current.free = event.type === 'keydown'
      if (gesture.current.moved) resizeLive(gesture.current)
      return
    }
    const editor = rootRef.current?.closest('dialog') ?? rootRef.current
    if (!editor?.contains(event.target as Node)) return
    if (event.key === ' ' || event.code === 'Space') {
      const target = event.target as Element
      if (isTyping(target) || target.closest('button, a, summary, [role="menuitemradio"]')) return
      event.preventDefault()
      if (event.type === 'keydown' && !event.repeat) setSpaceHeld(true)
      if (event.type === 'keyup') setSpaceHeld(false)
      return
    }
    if (event.type !== 'keydown') return
    const shortcut = shortcutFor(event, isTyping(event.target))
    // Cropping: only Enter and Esc (the editor's) do anything; zooming the view still works.
    if (shortcut?.kind === 'help' && cropping) return
    if (shortcut?.kind === 'help') {
      event.preventDefault()
      setHelpOpen(true)
    } else if (shortcut?.kind === 'zoom') {
      event.preventDefault()
      const to = shortcut.to
      if (to === 'in' || to === 'out') zoomStepTo(to === 'in' ? 1 : -1)
      else zoomTo(to === 'actual' ? 1 : to)
    }
  })
  useEffect(() => {
    const wheel = (event: WheelEvent) => onWheel(event)
    const gesture = (event: Event) => onGesture(event)
    const key = (event: KeyboardEvent) => onDocumentKey(event)
    const release = () => setSpaceHeld(false)
    document.addEventListener('wheel', wheel, { passive: false })
    document.addEventListener('keydown', key)
    document.addEventListener('keyup', key)
    window.addEventListener('blur', release)
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, gesture, { passive: false })
    return () => {
      document.removeEventListener('wheel', wheel)
      document.removeEventListener('keydown', key)
      document.removeEventListener('keyup', key)
      window.removeEventListener('blur', release)
      for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.removeEventListener(type, gesture)
    }
  }, [])

  // Cropping: a press anywhere but the picture, its frame and its bar (or the zoom bar) is Selesai.
  const onOutsidePress = useEffectEvent((event: PointerEvent) => {
    if (!cropping) return
    const target = event.target as Element
    if (target.closest?.('[data-crop-ui]')) return
    onCropEnd?.()
  })
  const croppingId = cropping?.id ?? null
  useEffect(() => {
    if (!croppingId) return
    const press = (event: PointerEvent) => onOutsidePress(event)
    document.addEventListener('pointerdown', press, true)
    return () => document.removeEventListener('pointerdown', press, true)
  }, [croppingId])

  // Two fingers on a phone or tablet: pinch to zoom about the fingers, and pan as they move together.
  const onTouch = useEffectEvent((event: TouchEvent) => {
    const node = areaRef.current
    if (!node) return
    if (event.touches.length !== 2) {
      if (event.type !== 'touchmove') pinch.current = null
      return
    }
    const [a, b] = [event.touches[0], event.touches[1]]
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
    const rect = node.getBoundingClientRect()
    const sx = mid.x - rect.left
    const sy = mid.y - rect.top
    event.preventDefault()
    if (!pinch.current || event.type === 'touchstart') {
      // The first finger may have started dragging a layer: a pinch isn't a drag.
      if (gesture.current) {
        gesture.current = null
        setLive(null)
      }
      pinch.current = {
        distance: Math.max(1, distance), scale,
        px: slidePointAt(node.scrollLeft, sx, node.clientWidth, doc.width, scale),
        py: slidePointAt(node.scrollTop, sy, node.clientHeight, doc.height, scale),
      }
      return
    }
    const target = clampZoom(pinch.current.scale * distance / pinch.current.distance, minScale)
    const base = pendingScale.current ?? scale
    if (Math.abs(target - base) < 1e-3) {
      node.scrollLeft = scrollToKeep(pinch.current.px, sx, node.clientWidth, doc.width, base)
      node.scrollTop = scrollToKeep(pinch.current.py, sy, node.clientHeight, doc.height, base)
      return
    }
    anchor.current = { px: pinch.current.px, py: pinch.current.py, sx, sy }
    pendingScale.current = target
    setZoom(target)
  })
  useEffect(() => {
    const node = areaRef.current
    if (!node) return
    const touch = (event: TouchEvent) => onTouch(event)
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) node.addEventListener(type, touch, { passive: false })
    return () => {
      for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) node.removeEventListener(type, touch)
    }
  }, [])

  /** Space+drag or a middle-button drag scrolls the area, over layers and the pen alike. */
  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    const middle = event.pointerType === 'mouse' && event.button === 1
    if (!middle && !(spaceHeld && event.button === 0)) return
    const node = areaRef.current
    if (!node) return
    event.preventDefault()
    event.stopPropagation()
    node.setPointerCapture(event.pointerId)
    pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop }
    setPanning(true)
  }
  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const current = pan.current
    const node = areaRef.current
    if (!current || !node || current.pointerId !== event.pointerId) return
    node.scrollLeft = current.left - (event.clientX - current.x)
    node.scrollTop = current.top - (event.clientY - current.y)
  }
  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (pan.current?.pointerId !== event.pointerId) return
    pan.current = null
    setPanning(false)
  }

  /** Tab / Shift+Tab on the slide: the next or previous layer, then on out of the slide as usual. */
  function tabLayers(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || event.metaKey || event.ctrlKey || event.altKey || drawing || cropping) return
    const target = event.target as HTMLElement
    if (target !== areaRef.current && !target.dataset.layerId) return
    const order = doc.layers.filter((layer) => !layer.hidden).map((layer) => layer.id)
    const at = order.indexOf(target.dataset.layerId ?? selectedId ?? '')
    const next = at < 0 ? (event.shiftKey ? order.length - 1 : 0) : at + (event.shiftKey ? -1 : 1)
    const id = order[next]
    if (!id) return
    event.preventDefault()
    areaRef.current?.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(id)}"]`)?.focus()
  }

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
    gesture.current = { id, handle, point, start: layer, x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false,
      dx: 0, dy: 0, free: event.shiftKey }
  }

  /** The handle drag as it stands, Shift (free) or not. */
  function resizeLive(current: Gesture) {
    if (!current.handle) return
    setLive({ doc: fitDoc(replaceLayer(doc, resizeRotatedLayer(current.start, current.handle, current.dx, current.dy, { free: current.free }))), guides: NO_GUIDES })
    if (current.start.kind === 'image') {
      const next = { free: current.free, corner: current.handle.length === 2 }
      setResizing((state) => (state?.free === next.free && state.corner === next.corner ? state : next))
    }
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
      current.dx = dx
      current.dy = dy
      current.free = event.shiftKey
      resizeLive(current)
      return
    }
    const others = doc.layers.filter((layer) => layer.id !== current.id && !layer.hidden)
    const next = moveLayer(current.start, dx, dy, doc, others, SNAP_SCREEN_PX / scale)
    setLive({ doc: replaceLayer(doc, next.layer), guides: next.guides })
    // A picture dragged over a frame: the frame lights up, and takes it when let go.
    if (current.start.kind === 'image') {
      const point = canvasPoint(event.clientX, event.clientY)
      const target = point ? frameAt(others, point.x, point.y)?.id ?? null : null
      setDropFrame((value) => (value === target ? value : target))
    }
  }

  function end(event: ReactPointerEvent<HTMLElement>, keep: boolean) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    gesture.current = null
    const result = liveRef.current
    setLive(null)
    setResizing(null)
    setDropFrame(null)
    if (!keep || !current.moved || !result) return
    const point = current.start.kind === 'image' && !current.handle ? canvasPoint(event.clientX, event.clientY) : undefined
    const moved = point ? result.doc.layers.find((layer) => layer.id === current.id) : undefined
    const dropped = point && moved ? dropLayerIntoFrame(result.doc, moved, point) : null
    if (dropped) {
      const frame = frameAt(doc.layers.filter((layer) => layer.id !== current.id), point!.x, point!.y)
      onCommit(dropped)
      if (frame) onSelect(frame.id)
      return
    }
    onCommit(result.doc)
  }

  /** Files dragged from the device: accepted over the whole canvas area; a frame under the pointer lights up. */
  function dragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (readOnly || drawing || cropping || !onDropImage || !dragHasImage(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (!fileOver) setFileOver(true)
    const point = canvasPoint(event.clientX, event.clientY)
    const target = point ? frameAt(doc.layers, point.x, point.y)?.id ?? null : null
    if (target !== dropFrame) setDropFrame(target)
  }
  function dragLeave(event: ReactDragEvent<HTMLDivElement>) {
    // Only leaving the area itself, not moving between its children.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setFileOver(false)
    setDropFrame(null)
  }
  function drop(event: ReactDragEvent<HTMLDivElement>) {
    if (!fileOver && !dragHasImage(event.dataTransfer)) return
    event.preventDefault()
    const target = dropFrame
    setFileOver(false)
    setDropFrame(null)
    if (readOnly || drawing || cropping || !onDropImage) return
    const image = clipImageOf(event.dataTransfer)
    if (image) onDropImage(image, target)
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

  /** A double click: type into text, crop a picture. */
  function openLayer(layer: Layer) {
    if (layer.locked) return
    if (layer.kind === 'text') onEditText(layer.id)
    else if (layer.kind === 'image' && !readOnly) onCropStart?.(layer.id)
    else if (layer.kind === 'frame' && !readOnly) {
      if (layer.assetId) onCropStart?.(layer.id)
      else onFillFrame?.(layer.id)
    }
  }

  const box = (layer: Layer) => ({ left: layer.x * scale, top: layer.y * scale, width: layer.w * scale, height: layer.h * scale,
    transform: `rotate(${layer.rotation ?? 0}deg)` })

  const editingPath = !readOnly && !drawing && selected?.kind === 'path' && !selected.locked && !selected.hidden ? selected : null

  const percent = Math.round(scale * 100)
  const presetValue = typeof zoom === 'number' && ZOOM_PRESETS.some((value) => Math.abs(value - zoom) < 1e-6) ? String(zoom) : null
  const zoomValue = typeof zoom === 'string' ? zoom : presetValue ?? 'custom'
  const tip = (label: string, combo: readonly string[]) => `${label} (${comboTitle(combo, mac)})`

  return (
    <div ref={rootRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
    {(drawing || cropping) && <div ref={setBarHost} className="contents" />}
    <div
      ref={areaRef}
      className={`relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent/60 ${
        panning ? 'cursor-grabbing! **:cursor-grabbing!' : spaceHeld ? 'cursor-grab! **:cursor-grab!' : ''}`}
      tabIndex={0}
      role="region"
      aria-label={t('canvas')}
      aria-describedby="layer-canvas-keys"
      // Panning goes first, over layers, handles and the pen alike.
      onPointerDownCapture={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      // Windows' middle-click autoscroll would fight the pan.
      onMouseDown={(event) => { if (event.button === 1) event.preventDefault() }}
      // A press anywhere around the slide lets go of the selection; presses on a layer or handle stop in start().
      // While drawing, a press off the slide does nothing: the outline stays and so does the selection.
      onPointerDown={(event) => {
        if (drawing || cropping || (event.pointerType === 'mouse' && event.button !== 0)) return
        onSelect(null)
      }}
      onKeyDown={tabLayers}
      onDragOver={dragOver}
      onDragLeave={dragLeave}
      onDrop={drop}
    >
      <span id="layer-canvas-keys" className="sr-only">{t('shortcuts.canvasHint')}</span>
      {scale > 0 && (
        <div style={{ minWidth: '100%', minHeight: '100%', width: doc.width * scale + 40, height: doc.height * scale + 40 }} className="flex items-center justify-center p-5">
        <div
          ref={slideRef}
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
            {!cropping && shown.layers.filter((layer) => !layer.hidden).map((layer) => (
              <div
                key={layer.id}
                data-layer-id={layer.id}
                role="button"
                tabIndex={0}
                aria-label={labelOf(layer)}
                aria-pressed={layer.id === selectedId}
                onPointerDown={(event) => start(event, layer.id, null)}
                onFocus={() => onSelect(layer.id)}
                onDoubleClick={() => openLayer(layer)}
                className={`absolute touch-none rounded-[1px] outline-none hover:outline hover:outline-1 hover:outline-accent/70 focus-visible:outline-2 focus-visible:outline-accent ${readOnly ? '' : 'cursor-move'}`}
                style={{ ...box(layer), ...(layer.field && layer.field.mode !== 'static'
                  ? { border: `1.5px dashed ${fieldReady(layer.field) ? '#15803d' : '#b91c1c'}` } : {}) }}
              />
            ))}

            {!cropping && shown.layers.map((layer) => layer.kind === 'frame' && !layer.hidden && !layer.assetId && (
              <EmptyFrameMark key={`mark-${layer.id}`} frame={layer} scale={scale} />
            ))}

            {live?.guides.vertical.map((x) => (
              <span key={`v${x}`} aria-hidden="true" className="pointer-events-none absolute -top-3 -bottom-3 w-px bg-[#ff3d9a]" style={{ left: x * scale }} />
            ))}
            {live?.guides.horizontal.map((y) => (
              <span key={`h${y}`} aria-hidden="true" className="pointer-events-none absolute -right-3 -left-3 h-px bg-[#ff3d9a]" style={{ top: y * scale }} />
            ))}

            {dropFrame && (() => {
              const frame = shown.layers.find((layer) => layer.id === dropFrame)
              if (!frame) return null
              // The frame's own outline (not its box), traced in screen px by the canvas geometry, so a circle or
              // heart lights up as a circle or heart: the picture lands exactly there.
              const w = frame.w * scale
              const h = frame.h * scale
              const recorder = new SvgPathRecorder()
              const kind = frame.kind === 'frame' ? frame.shape : 'rect'
              traceShape(recorder, kind, { x: 0, y: 0, w, h }, frame.kind === 'frame' ? frame.radius * scale : 0)
              return (
                <div aria-hidden="true" className="pointer-events-none absolute z-10" style={box(frame)}>
                  <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 overflow-visible">
                    <path d={recorder.d} fillRule={shapeFillRule(kind)} className="fill-accent/20" />
                    {/* A white underlay keeps the dashes readable on dark and busy pictures alike. */}
                    <path d={recorder.d} fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={4} strokeLinejoin="round" />
                    <path d={recorder.d} fill="none" strokeWidth={2} strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round"
                      className="stroke-accent motion-safe:animate-[frame-drop-march_0.8s_linear_infinite]" />
                  </svg>
                  <style>{'@keyframes frame-drop-march{to{stroke-dashoffset:-12}}'}</style>
                </div>
              )
            })()}

            {selected && !selected.hidden && !cropping && (
              <div
                className={`absolute touch-none outline-[1.5px] outline-accent outline-solid ${readOnly ? 'pointer-events-none' : 'cursor-move'}`}
                style={box(selected)}
                onPointerDown={(event) => start(event, selected.id, null)}
                onDoubleClick={() => openLayer(selected)}
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

            {cropping && onCropChange && (
              <CropOverlay layer={cropping} scale={scale} label={labelOf(cropping)} onChange={onCropChange} fixed={cropFixed} />
            )}
            {cropping && onCropChange && barHost && createPortal(
              <CropBar layer={cropping} onChange={onCropChange} onDone={() => onCropEnd?.()} onReset={onCropReset} fixed={cropFixed} />, barHost,
            )}

            {resizing && (
              <span role="status" className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[rgba(23,24,39,0.82)] px-3 py-1.5 text-[11px] font-medium whitespace-nowrap text-white shadow-[0_6px_18px_-8px_rgba(0,0,0,0.6)] backdrop-blur-sm">
                {resizing.free ? t('resizeFree') : resizing.corner ? t('resizeHint') : t('resizeCropHint')}
              </span>
            )}

            {fileOver && !dropFrame && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center bg-accent/10 pb-4 outline-2 -outline-offset-2 outline-accent outline-dashed">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(23,24,39,0.82)] px-3 py-1.5 text-[11px] font-medium whitespace-nowrap text-white shadow-[0_6px_18px_-8px_rgba(0,0,0,0.6)] backdrop-blur-sm">
                  <ImagePlus size={13} aria-hidden="true" className="shrink-0" />
                  {t('frames.dropAsLayer')}
                </span>
              </div>
            )}
            {fileOver && dropFrame && (
              <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-[0_6px_18px_-8px_rgba(0,0,0,0.6)]">
                <FrameGlyph size={13} aria-hidden="true" className="shrink-0" />
                {t('frames.dropInFrame')}
              </span>
            )}

            {drawing && (
              <PenLayer scale={scale} width={doc.width} height={doc.height} barHost={barHost} onDone={(result) => onDrawEnd?.(result)} />
            )}
          </div>
        </div>
        </div>
      )}
    </div>
    <div data-crop-ui="" role="group" aria-label={t('zoom')} className="relative flex h-11 shrink-0 items-center justify-center gap-1 border-t border-hairline bg-white px-2">
      <button type="button" aria-label={t('zoomOut')} title={tip(t('zoomOut'), ['mod', '-'])} disabled={scale <= minScale + 1e-6} onClick={() => zoomStepTo(-1)} className={ZOOM_BUTTON}><Minus size={16} aria-hidden="true" /></button>
      <select aria-label={t('zoom')} value={zoomValue} className="h-9 w-[7.5rem] rounded-md border border-hairline bg-white px-2 text-center text-xs font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-accent"
        onChange={(event) => {
          const value = event.target.value
          zoomTo(value === 'fit' || value === 'fill' ? value : Number(value))
        }}>
        <option value="fit">{zoom === 'fit' ? t('zoomFitAt', { percent }) : t('fitPage')}</option>
        <option value="fill">{zoom === 'fill' ? t('zoomFillAt', { percent }) : t('fillWidth')}</option>
        {zoomValue === 'custom' && <option value="custom" disabled>{percent}%</option>}
        {ZOOM_PRESETS.map((value) => <option key={value} value={String(value)}>{Math.round(value * 100)}%</option>)}
      </select>
      <button type="button" aria-label={t('zoomIn')} title={tip(t('zoomIn'), ['mod', '+'])} disabled={scale >= ZOOM_MAX - 1e-6} onClick={() => zoomStepTo(1)} className={ZOOM_BUTTON}><Plus size={16} aria-hidden="true" /></button>
      <button type="button" aria-label={t('fitPage')} title={tip(t('fitPage'), ['alt', 'mod', '0'])} aria-pressed={zoom === 'fit'} onClick={() => zoomTo('fit')} className={ZOOM_BUTTON}><Scan size={16} aria-hidden="true" /></button>
      <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-hairline md:block" />
      <button type="button" aria-label={t('shortcuts.title')} title={tip(t('shortcuts.title'), ['mod', '/'])} aria-haspopup="dialog" aria-expanded={helpOpen}
        onClick={() => setHelpOpen((open) => !open)} className={`${ZOOM_BUTTON} hidden md:inline-flex ${helpOpen ? 'bg-accent-soft text-accent' : ''}`}>
        <Keyboard size={17} aria-hidden="true" />
      </button>
      <span role="status" className="sr-only">{t('zoomStatus', { percent })}</span>
      {helpOpen && <ShortcutHelp mac={mac} onClose={() => setHelpOpen(false)} />}
    </div>
    </div>
  )
}

const ZOOM_BUTTON = 'inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent disabled:text-ink-soft disabled:hover:bg-transparent'

/** Pintasan keyboard: every shortcut, written for this platform (⌘ ⌥ ⇧ on a Mac, Ctrl Alt Shift elsewhere). */
function ShortcutHelp({ mac, onClose }: { mac: boolean; onClose: () => void }) {
  const t = useTranslations('editor.layerEditor.shortcuts')
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const dismiss = (refocus: boolean) => {
    onClose()
    if (refocus) panel.current?.closest('[role="group"]')?.querySelector<HTMLElement>('[aria-haspopup="dialog"]')?.focus()
  }
  const dismissOutside = useEffectEvent(() => onClose())
  useEffect(() => {
    const opener = document.activeElement
    closeButton.current?.focus()
    const outside = (event: PointerEvent) => {
      const target = event.target as Element
      if (!panel.current?.contains(target) && !target.closest?.('[aria-haspopup="dialog"]')) dismissOutside()
    }
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('pointerdown', outside)
      if (opener instanceof HTMLElement && document.activeElement === document.body) opener.focus()
    }
  }, [])
  const word = (token: string) => (WORD_KEYS as readonly string[]).includes(token) ? t(`keys.${token as WordKey}`) : token

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby="layer-shortcuts-title"
      // Esc closes the panel only, not the editor (the dialog's cancel follows an unprevented Esc).
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        dismiss(true)
      }}
      className="absolute origin-bottom-right transition-[opacity,translate,scale] duration-150 ease-out starting:translate-y-1 starting:scale-[0.98] starting:opacity-0 motion-reduce:transition-none right-2 bottom-[calc(100%+8px)] z-30 flex max-h-[min(70dvh,560px)] w-[min(calc(100vw-1rem),400px)] flex-col overflow-hidden rounded-2xl border border-hairline bg-white text-ink shadow-[0_24px_60px_-20px_rgba(23,24,39,0.45),0_2px_6px_-2px_rgba(23,24,39,0.12)]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-hairline py-1.5 pr-1.5 pl-4">
        <h3 id="layer-shortcuts-title" className="flex-1 text-sm font-semibold">{t('title')}</h3>
        <button ref={closeButton} type="button" onClick={() => dismiss(true)} aria-label={t('close')} className={ZOOM_BUTTON}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pt-1 pb-4">
        {SHORTCUT_HELP.map(({ group, items }) => (
          <section key={group} className="pt-3">
            <h4 className="mb-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">{t(`groups.${group}`)}</h4>
            <dl className="divide-y divide-hairline/70">
              {items.map(({ id, combos }) => (
                <div key={id} className="flex min-h-9 items-center gap-3 py-1">
                  <dt className="min-w-0 flex-1 text-[13px] text-ink-muted">{t(`items.${id}`)}</dt>
                  <dd className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {combos.map((combo, index) => (
                      <span key={index} className="contents">
                        {index > 0 && <span className="px-0.5 text-[11px] text-ink-soft">{t('or')}</span>}
                        <span className="inline-flex items-center gap-0.5">
                          {comboTokens(combo, mac).map((token, at) => (
                            <kbd key={at} className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 border-hairline bg-zinc-50 px-1.5 font-sans text-[11px] font-semibold text-ink">
                              {word(token)}
                            </kbd>
                          ))}
                        </span>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">{t('footnote')}</p>
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
    const ids = [...new Set([baseAssetId, ...doc.layers.flatMap(layer => {
      const id = layer.hidden ? null : layerAssetId(layer)
      return id ? [id] : []
    })])]
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
