'use client'

import { useLocale, useTranslations } from 'next-intl'
import {
  ArrowDownToLine, ClipboardPaste, Crop, Scissors, ArrowUpToLine, Bold, CaseUpper, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Flag, Image as ImageIcon, ImagePlus,
  Italic, LoaderCircle, Redo2, RotateCcw, Sparkles, Stamp, TextAlignCenter, TextAlignEnd, TextAlignStart, Trash2, TriangleAlert, Type,
  Underline, Undo2, Upload, X, Shapes, Copy, LockKeyhole, EyeOff, Frame as FrameIcon, ImageMinus, Layers, Move, Replace,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { confirmDialog } from '@/components/confirm-dialog'
import { FontPicker } from '@/components/font-picker'
import { useStorageFull } from '@/components/storage-full'
import type { Asset } from '@/lib/assets'
import { DEFAULT_BODY_FONT, DEFAULT_HEADING_FONT } from '@/lib/design-styles'
import { FIELD_PROMPT_LIMIT, fieldMaxChars, fieldReady } from '@/lib/design-fields'
import { flattenDoc, loadFonts, loadImage, prepareLayerUpload } from '@/lib/layer-canvas'
import type { GradientPreset } from '@/lib/gradients'
import {
  createHistory, duplicateLayer, emptyDoc, emptyFrame, fillFrame, isFontName, LAYER_LIMITS, layerDraftKey, layerImageUrl, newImageLayer, newOverlayLayer, newPathLayer, newTextLayer, newShapeLayer, normalizePath, pathPointsAbsolute, redo, reorder, TEXT_WEIGHTS, undo,
  type FrameLayer, type History, type ImageLayer, type Layer, type LayerDoc, type Reorder, type StrokeDash, type TextAlign, type TextLayer, type TextWeight, type ShapeLayer, type PathLayer,
} from '@/lib/layer-doc'
import { isLineKind } from '@/lib/shape-paths'
import type { PostMedia } from '@/lib/posts'
import { presetTextLayer, type TextPresetId } from '@/lib/text-presets'
import {
  aiElementAction, loadSlideLayersAction, logoLayerAssetAction, magicFeedbackAction, resetSlideLayersAction, saveSlideLayersAction, splitObjectAction, uploadLayerImageAction, uploadLayerImageFromUrlAction,
  type EditorBrand,
} from './layer-actions'
import { cancelGeneration } from './cancel-generation'
import { withCropOf } from './layer-editor-crop'
import { AiElementCard, ElementResults, ElementSearch, IconMenu, iconPng, TextStyleMenu } from './layer-editor-elements'
import type { ElementIcon } from './layer-editor-icons'
import { FillControl, OverlayMenu, withFill } from './layer-editor-fill'
import { SplitObjectDialog, type SplitRun, type SplitSource } from './layer-editor-split'
import { placeBackgroundSplit, placeLayerSplit } from './layer-editor-split-place'
import { familyOf, fitDoc, LayerCanvas, type BaseTone } from './layer-editor-canvas'
import { addLayer, AMEND_MS, editStep, nudgeLayer, readDraft, removeLayer, replaceLayer, sameDoc, updateLayer } from './layer-editor-gesture'
import type { PenResult } from './layer-editor-pen'
import { clipImageOf, dragHasImage, frameAsImage, frameWithCrop, newFrameFromPreset, type ClipImage, type FramePreset } from './layer-editor-frame-math'
import { FrameMenu } from './layer-editor-frames'
import { DashIcon, ShapeMenu } from './layer-editor-shapes'
import { copiedLayer, copyLayer, isTyping, pasteCopied, shortcutFor } from './layer-editor-shortcuts'
import { Thumbnail } from './thumbnail'
import { serializeLayerDraft } from '@/lib/layer-draft'

interface Loaded {
  baseAssetId: string
  version: string | null
  hasOriginal: boolean
  fromMagic: boolean
  /** The slide has stored layers; a flat slide gets the ✨ Lapisan ajaib offer instead. */
  layered: boolean
  readOnly: boolean
  /** The doc as stored, text boxes fitted to their lines: what "no changes" means. */
  initial: LayerDoc
  /** The brand kit's fonts and colours, for Gaya teks and a new icon's colour. */
  brand: EditorBrand
}

/** The idle panel's sections; a selected layer or the image picker replaces them. */
const PANEL_TABS = ['text', 'elements', 'images', 'layers'] as const
type PanelTab = (typeof PANEL_TABS)[number]
/** An icon's and an AI element's first width on the slide, as fractions of the canvas width. */
const ICON_SHARE = 0.16
const ELEMENT_SHARE = 0.45
const INK = { light: '#171827', dark: '#FFFFFF' } as const

interface LayerEditorProps {
  postId: string
  /** The slide image being edited. */
  media: PostMedia
  /** 1-based, for the title. */
  slide: number
  slides: PostMedia[]
  onSlideChange: (assetId: string) => void
  /** Saves the post's pending edits before anything reads or replaces its slides. */
  onFlush: () => Promise<boolean>
  onClose: () => void
  /** Closes the editor and opens ✨ Lapisan ajaib for this slide; unset hides the offer. */
  onMagicLayers?: () => void
  /** What Pisahkan objek costs and what's left; unset hides it. */
  billing?: { rate: number; planCredits: number; credits: number | null; trial: number | null }
}

/** A background swapped by Pisahkan objek: `doc` is the step that did it, so undoing it brings the old one back. */
interface BackgroundSwap { doc: LayerDoc; assetId: string }

/** What the panel shows while adding an image: where it comes from, then the library. */
type Adding = 'image' | 'library' | null

const WEIGHT_NAME = { 300: 'light', 400: 'regular', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold' } as const satisfies Record<TextWeight, string>
const UPLOAD_ERRORS = new Set(['image_too_large', 'image_unreadable'])

// Read in event handlers only: when an edit burst started.
const clock = () => Date.now()
const FIELD = 'w-full rounded-lg border border-hairline bg-white px-2.5 py-2 text-sm text-ink focus:border-accent focus:outline-none disabled:bg-zinc-50 disabled:text-ink-muted'
const LABEL = 'mb-1 block text-xs font-medium text-ink-muted'
const TOOL = 'inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink transition-colors hover:bg-zinc-100 disabled:text-ink-soft disabled:hover:bg-transparent'
const CHIP = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white px-3 text-sm font-medium text-ink transition-colors hover:bg-zinc-50 disabled:text-ink-soft disabled:hover:bg-white'

/**
 * Edit desain: the slide as layers over its background, full screen. Changes stay in the browser (and a draft in
 * localStorage) until Simpan flattens them into a new slide image.
 */
export function LayerEditor({ postId, media, slide, slides, onSlideChange, onFlush, onClose, onMagicLayers, billing }: LayerEditorProps) {
  const t = useTranslations('editor.layerEditor')
  const locale = useLocale()
  const router = useRouter()
  const storageFull = useStorageFull()
  const dialog = useRef<HTMLDialogElement>(null)
  const textArea = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const lastEdit = useRef<{ key: string; at: number } | null>(null)
  const draftKey = layerDraftKey(media.assetId)
  const loadFailed = t('loadFailed')

  const [attempt, setAttempt] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [draft, setDraft] = useState<LayerDoc | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [baseTone, setBaseTone] = useState<BaseTone>('dark')
  const [adding, setAdding] = useState<Adding>(null)
  const [library, setLibrary] = useState<Asset[] | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [, setFontTick] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [drawing, setDrawing] = useState(false)
  /** Potong: the image being cropped, as it is so far; committed as one step when done. */
  const [cropDraft, setCropDraftState] = useState<ImageLayer | null>(null)
  // Mirrors cropDraft for handlers that can run twice before a render (a press outside, then the button pressed).
  const cropRef = useRef<ImageLayer | null>(null)
  const setCropDraft = (next: ImageLayer | null) => {
    cropRef.current = next
    setCropDraftState(next)
  }
  /** A bingkai being repositioned: the picture's natural size, for Atur ulang. */
  const cropSource = useRef<{ width: number; height: number; start: ImageLayer } | null>(null)
  /** The bingkai the image picker (upload or Aset) fills, instead of adding a picture layer. */
  const [frameTarget, setFrameTarget] = useState<string | null>(null)
  /** ⌘V: the editor's own layer, unless the system clipboard has a picture (decided by the paste event). */
  const pendingPaste = useRef<number | undefined>(undefined)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitOperation, setSplitOperation] = useState<string | null>(null)
  const [cancellingSplit, setCancellingSplit] = useState(false)
  const [swap, setSwap] = useState<BackgroundSwap | null>(null)
  const [panelTab, setPanelTab] = useState<PanelTab>('text')
  const [elementQuery, setElementQuery] = useState('')
  /** The colour picked for new icons; null follows the slide's ink colour. */
  const [iconColor, setIconColor] = useState<string | null>(null)

  useEffect(() => {
    const node = dialog.current
    if (node && !node.open) node.showModal()
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = overflow
    }
  }, [])

  // Open: the stored layers, or an empty doc over the slide itself.
  useEffect(() => {
    let live = true
    loadSlideLayersAction({ postId, assetId: media.assetId })
      .catch(() => ({ error: loadFailed }))
      .then((result) => {
        if (!live) return
        if ('error' in result) {
          setLoadError(result.error)
          return
        }
        const stored = result.layers
        const initial = fitDoc(stored?.doc ?? emptyDoc(media.width, media.height))
        setLoaded({
          baseAssetId: stored?.baseAssetId ?? media.assetId,
          version: stored?.version ?? null,
          hasOriginal: stored?.hasOriginal ?? false,
          fromMagic: stored?.fromMagic ?? false,
          layered: stored !== null,
          readOnly: result.readOnly,
          initial,
          brand: result.brand,
        })
        setHistory(createHistory(initial))
        if (!result.readOnly) {
          let raw: string | null = null
          try { raw = window.localStorage.getItem(draftKey) } catch { /* private mode */ }
          setDraft(readDraft(raw, initial))
        }
      })
    return () => {
      live = false
    }
  }, [attempt, postId, media.assetId, media.width, media.height, draftKey, loadFailed])

  const doc = history?.present ?? null
  const readOnly = loaded?.readOnly ?? true
  // The swap holds while its step is done (in the past or trimmed from it), not once it has been undone.
  const swapped = swap && history && !history.future.includes(swap.doc) ? swap.assetId : null
  const background = swapped ?? loaded?.baseAssetId ?? media.assetId
  const dirty = Boolean(loaded && doc && !readOnly && (swapped !== null || !sameDoc(doc, loaded.initial)))

  // Fonts arrive after the first layout: measure again, and refit the boxes, once they have.
  const fontKey = doc ? [...new Set(doc.layers.flatMap((layer) => (layer.kind === 'text' ? [`${layer.font}:${layer.weight}`] : [])))].join('|') : ''
  useEffect(() => {
    if (!doc || !fontKey) return
    let live = true
    void loadFonts(doc, familyOf).then(() => {
      if (!live) return
      setFontTick((tick) => tick + 1)
      setHistory((current) => (current ? { ...current, present: fitDoc(current.present) } : current))
      setLoaded((current) => (current ? { ...current, initial: fitDoc(current.initial) } : current))
    })
    return () => {
      live = false
    }
    // Only a new font or weight needs a reload; `doc` is read for its families.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontKey])

  // The draft follows every change, so a lost connection or a closed tab doesn't lose the work.
  useEffect(() => {
    if (!doc || readOnly || draft) return
    const timer = window.setTimeout(() => {
      try {
        if (dirty) window.localStorage.setItem(draftKey, serializeLayerDraft(doc, loaded?.version ?? null))
        else window.localStorage.removeItem(draftKey)
      } catch { /* full or private: the editor still works */ }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [doc, dirty, readOnly, draft, draftKey, loaded?.version])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const forgetDraft = () => {
    try { window.localStorage.removeItem(draftKey) } catch { /* nothing kept */ }
  }

  /** One change into the history; a burst on the same `key` (typing, a colour drag) is one step. */
  function edit(next: LayerDoc, key?: string) {
    if (readOnly) return
    const now = clock()
    const amend = Boolean(key && lastEdit.current?.key === key && now - lastEdit.current.at < AMEND_MS)
    lastEdit.current = key ? { key, at: now } : null
    // A new edit after undoing Pisahkan objek drops that step for good, and with it the new background.
    if (swap && history?.future.includes(swap.doc)) setSwap(null)
    setHistory((current) => (current ? editStep(current, fitDoc(next), amend) : current))
  }

  const selected = doc?.layers.find((layer) => layer.id === selectedId) ?? null
  const editSelected = (change: (layer: Layer) => Layer, key?: string) => {
    if (doc && selected) edit(updateLayer(doc, selected.id, change), key && `${key}:${selected.id}`)
  }
  const full = (doc?.layers.length ?? 0) >= LAYER_LIMITS.layers

  /** Potong: on a picture (double click, or the panel's button). */
  function startCrop(id: string) {
    const layer = doc?.layers.find((item) => item.id === id)
    if (!layer || layer.locked || layer.hidden || readOnly || working) return
    if (layer.kind === 'frame') return void startFrameCrop(layer)
    if (layer.kind !== 'image') return
    setDrawing(false)
    setAdding(null)
    setSelectedId(id)
    cropSource.current = null
    setCropDraft(layer)
  }

  /** Atur posisi on a bingkai: the picture pans and zooms inside the frame, which stays put. */
  async function startFrameCrop(frame: FrameLayer) {
    const assetId = frame.assetId
    if (!assetId) return
    setDrawing(false)
    setAdding(null)
    setSelectedId(frame.id)
    try {
      const image = await loadImage(layerImageUrl(assetId))
      const start = frameAsImage({ ...frame, assetId }, image.naturalWidth, image.naturalHeight)
      cropSource.current = { width: image.naturalWidth, height: image.naturalHeight, start }
      setCropDraft(start)
    } catch {
      setError(t('failed'))
    }
  }

  /** Atur ulang for a bingkai: the picture centred, covering the frame. */
  function resetFrameCrop(draft: ImageLayer): ImageLayer {
    const source = cropSource.current
    const frame = doc?.layers.find((item) => item.id === draft.id)
    if (!source || frame?.kind !== 'frame' || !frame.assetId) return draft
    const centred: FrameLayer = { ...frame }
    delete centred.crop
    return frameAsImage({ ...centred, assetId: frame.assetId }, source.width, source.height)
  }

  /** Selesai: the crop session as one history step (none when nothing changed). */
  function finishCrop() {
    const draft = cropRef.current
    setCropDraft(null)
    if (!draft || !doc) return
    const layer = doc.layers.find((item) => item.id === draft.id)
    if (!layer || (layer.kind !== 'image' && layer.kind !== 'frame')) return
    // A bingkai opened and closed without moving its picture: no step.
    const start = cropSource.current?.start
    if (layer.kind === 'frame' && start?.id === draft.id && JSON.stringify(start.crop) === JSON.stringify(draft.crop)) return
    const next = layer.kind === 'frame' ? frameWithCrop(layer, draft) : withCropOf(layer, draft)
    if (JSON.stringify(next) !== JSON.stringify(layer)) edit(replaceLayer(doc, next))
  }

  function stepHistory(direction: 'undo' | 'redo') {
    lastEdit.current = null
    setHistory((current) => (current ? (direction === 'undo' ? undo(current) : redo(current)) : current))
  }

  function remove() {
    if (!doc || !selected || selected.locked) return
    edit(removeLayer(doc, selected.id))
    setSelectedId(null)
  }

  function duplicate() {
    if (!doc || !selected) return
    const result = duplicateLayer(doc, selected.id)
    if (!result.id) return
    edit(result.doc)
    setSelectedId(result.id)
  }

  function addShape(shape: ShapeLayer['shape']) {
    if (!doc || full) return
    setDrawing(false)
    const layer = newShapeLayer(doc, shape)
    edit(addLayer(doc, layer))
    setSelectedId(layer.id)
    setSheetOpen(true)
  }

  /** Bingkai: an empty frame, selected, ready for a picture. */
  function addFrame(preset: FramePreset) {
    if (!doc || full) return
    setDrawing(false)
    const layer = newFrameFromPreset(doc, preset)
    edit(addLayer(doc, layer))
    setSelectedId(layer.id)
    setSheetOpen(true)
  }

  /** The picture into the bingkai, shown from its centre. */
  function fillFrameWith(id: string, assetId: string) {
    if (!doc) return
    edit(updateLayer(doc, id, (layer) => (layer.kind === 'frame' ? fillFrame(layer, assetId) : layer)))
    setFrameTarget(null)
    setSelectedId(id)
  }

  /** Gambar's picker: for a new picture layer, or (`frameId`) to fill / replace a bingkai's picture. */
  function chooseImage(frameId: string | null) {
    setDrawing(false)
    setFrameTarget(frameId)
    setAdding('image')
    setSheetOpen(true)
  }

  /** Overlay gradien: the slide-sized gradient goes under the text, so it lifts the words off the photo. */
  function addOverlay(preset: GradientPreset) {
    if (!doc || full) return
    setDrawing(false)
    const layer = newOverlayLayer(doc, preset, t(`gradients.${preset.id}` as 'gradients.shadeBottom'))
    const text = doc.layers.findIndex((item) => item.kind === 'text')
    const layers = [...doc.layers]
    layers.splice(text < 0 ? layers.length : text, 0, layer)
    edit({ ...doc, layers })
    setSelectedId(layer.id)
    setSheetOpen(true)
  }

  /** Pisahkan objek, from the background or the selected picture; the result lands as one step. */
  async function runSplit(source: SplitSource): Promise<SplitRun> {
    if (!doc || readOnly) return { error: t('failed') }
    const layer = source === 'layer' && selected?.kind === 'image' ? selected : null
    if (source === 'layer' && !layer) return { error: t('split.layerHint') }
    if (full) return { error: t('split.full') }
    const operationId = crypto.randomUUID()
    setSplitOperation(operationId)
    const result = await splitObjectAction({
      postId, assetId: media.assetId, operationId,
      source: layer ? { kind: 'layer', layerAssetId: layer.assetId } : { kind: 'background' },
    }).catch(() => ({ error: t('split.failed') }))
    setSplitOperation(null)
    if ('error' in result) return storageFull(result.error) ? { error: null } : { error: result.error }
    // The dialog is modal while it runs, so `doc` is still the doc it started from.
    const placed = layer ? placeLayerSplit(doc, layer.id, result) : placeBackgroundSplit(doc, result)
    if (!placed) return { error: t('split.full') }
    const next = fitDoc(placed.doc)
    edit(next)
    if (!layer) setSwap({ doc: next, assetId: result.cleaned.assetId })
    setSelectedId(placed.layer.id)
    setSheetOpen(true)
    setSplitOpen(false)
    return { ok: true }
  }

  async function cancelSplit() {
    if (!splitOperation || cancellingSplit) return
    setCancellingSplit(true)
    const result = await cancelGeneration(postId, 'edit', splitOperation, locale)
    setCancellingSplit(false)
    if (result.error) setError(result.error)
  }

  /** Bentuk bebas: the canvas takes pen points until the outline is finished or cancelled. */
  function startDrawing() {
    if (!doc || full || readOnly) return
    setSelectedId(null)
    setAdding(null)
    setDrawing(true)
    // On phones the sheet would cover the slide.
    setSheetOpen(false)
  }

  function finishDrawing(result: PenResult | null) {
    setDrawing(false)
    if (!result || !doc || full) return
    const layer = newPathLayer(doc, result.points, result.closed)
    if (!layer) {
      setError(t('penFailed'))
      return
    }
    edit(addLayer(doc, layer))
    setSelectedId(layer.id)
    setSheetOpen(true)
  }

  function addText() {
    if (!doc || full) return
    setDrawing(false)
    const font = doc.layers.find((layer): layer is TextLayer => layer.kind === 'text')?.font ?? loaded?.brand.headingFont ?? DEFAULT_HEADING_FONT
    const layer = newTextLayer(doc, t('newText'), font, INK[baseTone])
    edit(addLayer(doc, layer))
    setSelectedId(layer.id)
    setSheetOpen(true)
    window.setTimeout(() => textArea.current?.select(), 0)
  }

  /** Gaya teks: an editorial style in the brand's fonts; the accent styles take the brand's first colour. */
  function addTextPreset(preset: TextPresetId, text: string) {
    if (!doc || full) return
    setDrawing(false)
    const brand = loaded?.brand
    const ink = INK[baseTone]
    const layer = presetTextLayer(doc, preset, text,
      { heading: brand?.headingFont ?? DEFAULT_HEADING_FONT, body: brand?.bodyFont ?? DEFAULT_BODY_FONT },
      { ink, accent: brand?.colors.find((color) => color !== ink) ?? ink })
    edit(addLayer(doc, layer))
    setSelectedId(layer.id)
    setSheetOpen(true)
    window.setTimeout(() => textArea.current?.select(), 0)
  }

  /** `share` sets the new layer's width as a fraction of the canvas width (an icon starts small), keeping its shape. */
  function addImage(assetId: string, role: ImageLayer['role'], width: number, height: number, share?: number) {
    if (!doc || full) return
    setDrawing(false)
    const fitted = newImageLayer(doc, assetId, role, width, height)
    const w = share ? Math.round(doc.width * share) : fitted.w
    const h = share ? Math.round((w * height) / Math.max(1, width)) : fitted.h
    const layer = { ...fitted, w, h, x: Math.round((doc.width - w) / 2), y: Math.round((doc.height - h) / 2) }
    edit(addLayer(doc, layer))
    setSelectedId(layer.id)
  }

  /** Ikon: drawn to a PNG in the chosen colour by the browser, then stored and placed like any uploaded picture. */
  async function addIcon(_item: ElementIcon, svg: SVGSVGElement) {
    if (!doc || readOnly || working || full) return
    try {
      await uploadImage(await iconPng(svg, iconColor ?? INK[baseTone]), null, ICON_SHARE)
      setSheetOpen(true)
    } catch {
      setError(t('elements.iconFailed'))
    }
  }

  /** Elemen AI: resolves to a message when nothing was placed. */
  async function runAiElement(prompt: string): Promise<string | null> {
    if (!doc || readOnly) return t('failed')
    if (full) return t('full', { max: LAYER_LIMITS.layers })
    const result = await aiElementAction({ prompt }).catch(() => ({ error: t('elements.aiFailed') }))
    if ('error' in result) {
      // A full storage also opens its own dialog; the card keeps the description either way.
      storageFull(result.error)
      return result.error
    }
    addImage(result.assetId, 'object', result.width, result.height, ELEMENT_SHARE)
    setSheetOpen(true)
    return null
  }

  async function addLogo() {
    setError(null)
    setWorking(t('preparingLogo'))
    const result = await logoLayerAssetAction().catch(() => ({ error: t('failed') }))
    setWorking(null)
    if ('error' in result) {
      if (!storageFull(result.error)) setError(result.error)
      return
    }
    addImage(result.assetId, 'logo', result.width, result.height)
  }

  /**
   * A picture from the device (the file picker, a drop or a paste): into the bingkai `frameId` when given, else a
   * new picture layer.
   */
  async function uploadImage(image: File | ClipImage, frameId: string | null = null, share?: number) {
    if (!doc || readOnly || working) return
    const frame = frameId ? doc.layers.find((layer) => layer.id === frameId && layer.kind === 'frame' && !layer.locked) : undefined
    if (!frame && full) {
      setError(t('full', { max: LAYER_LIMITS.layers }))
      return
    }
    const source = image instanceof File ? { file: image } : image
    setError(null)
    setWorking(t('uploading'))
    try {
      let result: Awaited<ReturnType<typeof uploadLayerImageAction>>
      if ('url' in source) {
        // A picture copied out of a web page: the server fetches it, the browser can't (CORS).
        result = await uploadLayerImageFromUrlAction(source.url).catch(() => ({ error: t('failed') }))
      } else {
        const prepared = await prepareLayerUpload(source.file)
        const form = new FormData()
        form.set('file', prepared.blob, prepared.blob.type === 'image/png' ? 'layer.png' : 'layer.jpg')
        form.set('width', String(prepared.width))
        form.set('height', String(prepared.height))
        result = await uploadLayerImageAction(form).catch(() => ({ error: t('failed') }))
      }
      if ('error' in result) {
        if (!storageFull(result.error)) setError(result.error)
        return
      }
      setAdding(null)
      // The editor is busy while uploading, so `doc` is still the doc it started from.
      if (frame) fillFrameWith(frame.id, result.assetId)
      else addImage(result.assetId, 'upload', result.width, result.height, share)
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : ''
      setError(UPLOAD_ERRORS.has(code) ? t(`uploadErrors.${code as 'image_too_large' | 'image_unreadable'}`) : t('failed'))
    } finally {
      setWorking(null)
    }
  }

  async function openLibrary() {
    setAdding('library')
    setSheetOpen(true)
    if (library) return
    setLibraryError(null)
    try {
      const response = await fetch('/api/content/assets', { cache: 'no-store' })
      if (!response.ok || response.redirected) throw new Error('library_unavailable')
      setLibrary((await response.json()) as Asset[])
    } catch {
      setLibraryError(t('libraryFailed'))
    }
  }

  /** Leaves the editor, asking first when there are unsaved changes; `then` runs once it's let go. */
  async function close(then: () => void = onClose) {
    if (working) return
    if (dirty && !(await confirmDialog({
      title: t('discardTitle'),
      description: t('discardDescription'),
      confirmLabel: t('discard'),
      cancelLabel: t('keepEditing'),
      tone: 'danger',
    }))) return
    if (dirty) forgetDraft()
    then()
  }

  function switchSlide(assetId: string) {
    if (working || assetId === media.assetId) return
    // Flush the debounce before unmounting this slide, including a draft not restored yet.
    try {
      if (dirty && doc) window.localStorage.setItem(draftKey, serializeLayerDraft(doc, loaded?.version ?? null))
    } catch {
      setError(t('draftSaveFailed'))
      return
    }
    onSlideChange(assetId)
  }

  async function save() {
    if (!doc || !loaded || readOnly || working) return
    setError(null)
    setSelectedId(null)
    setDrawing(false)
    setCropDraft(null)
    setWorking(t('saving'))
    try {
      if (!(await onFlush())) throw new Error(t('flushFailed'))
      const prepared = await flattenDoc(doc, background, familyOf)
      const form = new FormData()
      form.set('file', prepared.blob, 'slide.jpg')
      form.set('width', String(prepared.width))
      form.set('height', String(prepared.height))
      form.set('postId', postId)
      form.set('oldAssetId', media.assetId)
      form.set('doc', JSON.stringify(doc))
      form.set('expectedVersion', loaded.version ?? '')
      // Pisahkan objek on the background: the cleaned image becomes the doc's background.
      if (swapped && swapped !== loaded.baseAssetId) form.set('backgroundAssetId', swapped)
      const result = await saveSlideLayersAction(form).catch(() => ({ error: t('failed') }))
      if ('error' in result) {
        setWorking(null)
        if (!storageFull(result.error)) setError(result.error)
        return
      }
      forgetDraft()
      router.refresh()
      onClose()
    } catch (caught) {
      setWorking(null)
      setError(caught instanceof Error && caught.message === t('flushFailed') ? caught.message : t('exportFailed'))
    }
  }

  async function reset() {
    if (!(await confirmDialog({
      title: t('resetTitle'),
      description: t('resetDescription'),
      confirmLabel: t('reset'),
      tone: 'danger',
    }))) return
    setError(null)
    setWorking(t('resetting'))
    const result = await resetSlideLayersAction({ postId, assetId: media.assetId }).catch(() => t('failed'))
    if (result) {
      setWorking(null)
      if (!storageFull(result)) setError(result)
      return
    }
    forgetDraft()
    router.refresh()
    onClose()
  }

  async function feedback() {
    setFeedbackSent(true)
    const result = await magicFeedbackAction({ assetId: media.assetId }).catch(() => t('failed'))
    if (result) {
      setFeedbackSent(false)
      setError(result)
    }
  }

  /** ⌘C / ⌘X: the selected layer into the editor's clipboard, which every slide of this editor shares. */
  function copySelected(cut: boolean) {
    if (!doc || !selected) return
    copyLayer(selected)
    // A copied layer replaces whatever picture the system clipboard held, so ⌘V pastes the layer, as in Canva.
    void navigator.clipboard?.writeText(selected.kind === 'text' ? selected.text : '').catch(() => {})
    if (cut && !selected.locked && !readOnly) remove()
  }

  function paste() {
    if (!doc || readOnly) return
    const result = pasteCopied(doc)
    if (!result) {
      if (copiedLayer() && full) setError(t('full', { max: LAYER_LIMITS.layers }))
      return
    }
    setDrawing(false)
    setAdding(null)
    edit(result.doc)
    setSelectedId(result.layer.id)
  }

  /**
   * ⌘V with a picture on the system clipboard (a screenshot, "Copy image" in a browser, an image copied out of a page
   * such as Google, which brings only its HTML or address): into the selected empty or filled bingkai, else a new
   * picture layer. Without a picture it's the editor's own copied layer (copying one clears the system clipboard).
   */
  const pasteFromClipboard = useEffectEvent((event: ClipboardEvent) => {
    if (isTyping(event.target)) return
    const target = event.target as Node | null
    if (target && target !== document.body && !dialog.current?.contains(target)) return
    window.clearTimeout(pendingPaste.current)
    pendingPaste.current = undefined
    if (!doc || readOnly || working || drawing || cropDraft) return
    const image = clipImageOf(event.clipboardData)
    // Copying a layer empties the system clipboard (copySelected), so a picture there was copied after it and wins,
    // except a text layer's own words that happen to be an address.
    const copied = copiedLayer()
    const ownText = copied?.kind === 'text' && image && 'url' in image && copied.text.trim() === image.url
    if (copied && (!image || ownText)) {
      event.preventDefault()
      paste()
      return
    }
    if (!image) {
      // Something was copied, but not a picture (e.g. only text): say so rather than doing nothing.
      if (event.clipboardData?.types.length) setError(t('frames.pasteNone'))
      return
    }
    event.preventDefault()
    setAdding(null)
    void uploadImage(image, selected?.kind === 'frame' && !selected.locked ? selected.id : null)
  })
  useEffect(() => {
    const listen = (event: ClipboardEvent) => pasteFromClipboard(event)
    document.addEventListener('paste', listen)
    return () => {
      document.removeEventListener('paste', listen)
      window.clearTimeout(pendingPaste.current)
    }
  }, [])

  /**
   * Canva-style shortcuts (layer-editor-shortcuts.ts). Zoom and the shortcut list are the canvas's own, on the
   * document so they work wherever focus is. Ignored while typing in a field and while the pen is drawing (it owns
   * Enter, Esc, Backspace and Ctrl+Z, which take back a point).
   */
  function onKeyDown(event: React.KeyboardEvent) {
    // Cropping: Enter is Selesai (Esc too, through the dialog's cancel); no other shortcut runs meanwhile.
    if (cropDraft) {
      if (event.key === 'Enter' && !(event.target as Element).closest('button, input, select, textarea')) {
        event.preventDefault()
        finishCrop()
      }
      return
    }
    if (isTyping(event.target) || !doc || drawing || working) return
    const shortcut = shortcutFor(event)
    if (!shortcut || shortcut.kind === 'zoom' || shortcut.kind === 'help') return
    // Keys on a button (Delete on the layer list, ⌘C on Simpan…) still mean the slide; only Enter/Space are its own.
    const run = (action: () => void) => {
      event.preventDefault()
      action()
    }
    switch (shortcut.kind) {
      case 'undo': return run(() => stepHistory('undo'))
      case 'redo': return run(() => stepHistory('redo'))
      case 'paste': {
        // Not prevented, so the browser's paste event still fires with the system clipboard; it decides (above).
        // Where a browser sends no paste event, the editor's layer pastes anyway.
        if (!copiedLayer()) return
        window.clearTimeout(pendingPaste.current)
        pendingPaste.current = window.setTimeout(paste, 80)
        return
      }
      case 'selectTop': {
        // One layer at a time: ⌘A picks the top visible one.
        const top = doc.layers.findLast((layer) => !layer.hidden)
        return run(() => { if (top) { setAdding(null); setSelectedId(top.id); setSheetOpen(true) } })
      }
      case 'add': {
        if (readOnly || full) return
        return run(() => {
          setAdding(null)
          if (shortcut.what === 'text') addText()
          else addShape(shortcut.what)
        })
      }
    }
    if (!selected) return
    if (shortcut.kind === 'copy') return run(() => copySelected(false))
    if (readOnly) return
    switch (shortcut.kind) {
      case 'cut': return run(() => copySelected(true))
      case 'duplicate': return run(duplicate)
      case 'lock': return run(() => editSelected((layer) => ({ ...layer, locked: !layer.locked })))
    }
    // A locked layer stays put, as in the panel.
    if (selected.locked) return
    switch (shortcut.kind) {
      case 'reorder': return run(() => edit(reorder(doc, selected.id, shortcut.to)))
      case 'remove': return run(remove)
      case 'nudge': return run(() => editSelected((layer) => nudgeLayer(layer, shortcut.dx, shortcut.dy, doc), 'nudge'))
    }
  }

  const labelOf = (layer: Layer) =>
    layer.name || (layer.kind === 'text'
      ? t('textLabel', { text: layer.text.replace(/\s+/g, ' ').trim().slice(0, 40) || '…' })
      : layer.kind === 'shape' ? t(`shapes.${layer.shape}`) : layer.kind === 'path' ? t('shapes.path')
        : layer.kind === 'frame' ? t('frames.label', { name: t(`shapes.${layer.shape}`) }) : t(`roles.${layer.role}`))
  const croppingFrame = Boolean(cropDraft && doc?.layers.some((layer) => layer.id === cropDraft.id && layer.kind === 'frame'))

  return (
    <dialog
      ref={dialog}
      aria-labelledby="layer-editor-heading"
      onCancel={(event) => {
        // Esc: let go of the selection first, then close.
        event.preventDefault()
        if (cropDraft) finishCrop()
        else if (drawing) setDrawing(false)
        else if (adding) setAdding(null)
        else if (selectedId) setSelectedId(null)
        else void close()
      }}
      onKeyDown={onKeyDown}
      // A file or web picture let go outside the canvas mustn't open in the tab (and lose the work); the canvas takes its own drops.
      onDragOver={(event) => { if (dragHasImage(event.dataTransfer)) event.preventDefault() }}
      onDrop={(event) => { if (dragHasImage(event.dataTransfer)) event.preventDefault() }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-clip bg-transparent p-0 backdrop:bg-[rgba(20,21,31,0.55)]"
    >
      <div className="flex h-dvh w-full flex-col overflow-clip bg-bg text-ink">
        {/* Top bar: icons on phones, so Simpan always fits. */}
        <header className="flex h-14 shrink-0 items-center gap-0.5 border-b border-hairline bg-white pr-2 pl-1 pt-[env(safe-area-inset-top)] md:gap-1 md:px-3">
          <button type="button" onClick={() => void close()} aria-label={t('close')} title={t('close')} className={TOOL} disabled={working !== null}>
            <X size={19} aria-hidden="true" />
          </button>
          <h2 id="layer-editor-heading" className="flex min-w-0 flex-1 items-center gap-2 px-1 text-sm font-semibold md:text-base">
             <span className="truncate">{t('title', { slide })}</span>
            {readOnly && loaded && <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-ink-muted">{t('viewOnly')}</span>}
          </h2>
           {!readOnly && history && (
            <>
              <button type="button" onClick={() => stepHistory('undo')} disabled={history.past.length === 0 || working !== null} aria-label={t('undo')} title={`${t('undo')} (Ctrl+Z)`} className={TOOL}>
                <Undo2 size={18} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => stepHistory('redo')} disabled={history.future.length === 0 || working !== null} aria-label={t('redo')} title={`${t('redo')} (Ctrl+Shift+Z)`} className={TOOL}>
                <Redo2 size={18} aria-hidden="true" />
              </button>
              {billing && (
                <button type="button" onClick={() => { finishCrop(); setDrawing(false); setSplitOpen(true) }} disabled={working !== null || full}
                  aria-haspopup="dialog" title={t('split.button')}
                  className={`${TOOL} gap-1.5 md:w-auto md:px-3 md:text-sm md:font-medium`}>
                  <Scissors size={17} aria-hidden="true" />
                  <span className="max-md:sr-only">{t('split.button')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || working !== null}
                className="ml-1 inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm md:px-4 font-semibold text-white transition-colors hover:bg-accent-deep disabled:bg-zinc-200 disabled:text-ink-soft"
              >
                {working === t('saving') && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
                {t('save')}
              </button>
            </>
          )}
        </header>

        {slides.length > 1 && <nav aria-label={t('slides')} className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-hairline bg-white px-3 py-2">
          {slides.map((item, index) => <button key={item.assetId} type="button" disabled={working !== null}
            onClick={() => switchSlide(item.assetId)} aria-current={item.assetId === media.assetId ? 'page' : undefined}
            aria-label={t('openSlide', { slide: index + 1 })}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-2 py-1 text-sm disabled:opacity-50 ${item.assetId === media.assetId ? 'border-accent bg-accent/5 font-semibold text-accent-deep' : 'border-hairline hover:bg-zinc-50'}`}>
            <Thumbnail id={item.assetId} src={item.url} size={96} className="h-9 w-7 rounded object-cover" />
            <span>{index + 1}</span>
          </button>)}
          <span className="hidden shrink-0 px-2 text-xs text-ink-muted md:inline">{t('slideDraftHint')}</span>
        </nav>}

        {loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p role="alert" className="text-sm text-red-700">{loadError}</p>
            <button type="button" onClick={() => { setLoadError(null); setAttempt((value) => value + 1) }} className={CHIP}>{t('retry')}</button>
          </div>
        ) : !doc || !loaded ? (
          <div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-muted">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            {t('loading')}
          </div>
        ) : (
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-clip md:flex-row">
            {/* Canvas: never squeezed to nothing by the sheet below it. */}
            <div className="relative flex min-h-[30dvh] min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_1px_1px,rgba(23,24,39,0.09)_1px,transparent_0)] [background-size:18px_18px]">
              {(draft || readOnly || error) && (
                <div className="shrink-0 space-y-2 px-3 pt-3 md:px-6">
                  {draft && (
                    <Banner tone="info">
                      <span className="flex-1">{t('draftFound')}</span>
                      <button type="button" className="font-semibold text-accent hover:text-accent-deep" onClick={() => {
                        edit(draft)
                        setDraft(null)
                      }}>{t('draftRestore')}</button>
                      <button type="button" className="text-ink-muted hover:text-ink" onClick={() => {
                        forgetDraft()
                        setDraft(null)
                      }}>{t('draftDiscard')}</button>
                    </Banner>
                  )}
                  {readOnly && <Banner tone="info">{t('readOnly')}</Banner>}
                  {error && <Banner tone="error">{error}</Banner>}
                </div>
              )}
              <div
                className="flex min-h-40 min-w-0 flex-1 p-3 md:p-8"
                onPointerDown={(event) => { if (event.target === event.currentTarget && !drawing) setSelectedId(null) }}
              >
                <LayerCanvas
                  doc={cropDraft ? updateLayer(doc, cropDraft.id, (layer) => (layer.kind === 'image' ? withCropOf(layer, cropDraft)
                    : layer.kind === 'frame' ? frameWithCrop(layer, cropDraft) : layer)) : doc}
                  baseAssetId={background}
                  selectedId={selectedId}
                  readOnly={readOnly || working !== null}
                  labelOf={labelOf}
                  onSelect={(id) => {
                    if (drawing) return
                    setSelectedId(id)
                    if (id) { setAdding(null); setSheetOpen(true) }
                  }}
                  onCommit={(next) => edit(next)}
                  onEditText={() => {
                    setSheetOpen(true)
                    window.setTimeout(() => textArea.current?.focus(), 0)
                  }}
                  onBaseTone={setBaseTone}
                  drawing={drawing && !readOnly && working === null}
                  onDrawEnd={finishDrawing}
                  cropping={cropDraft}
                  onCropChange={setCropDraft}
                  onCropStart={startCrop}
                  onCropEnd={finishCrop}
                  cropFixed={croppingFrame}
                  onCropReset={croppingFrame ? resetFrameCrop : undefined}
                  onFillFrame={(id) => chooseImage(id)}
                  onDropImage={(image, frameId) => void uploadImage(image, frameId)}
                />
              </div>
              {working && (
                <div role="status" className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium shadow-[0_4px_20px_-6px_rgba(23,24,39,0.35)]">
                    <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                    {working}
                  </span>
                </div>
              )}
            </div>

            {/* Panel: a side panel on desktop, a bottom sheet on phones. */}
            <aside
              aria-label={t('panel')}
              className="relative flex max-h-[45dvh] w-full min-w-0 shrink-0 flex-col overflow-clip rounded-t-2xl border-t border-hairline bg-white shadow-[0_-12px_30px_-18px_rgba(23,24,39,0.3)] md:max-h-none md:w-80 md:rounded-none md:border-t-0 md:border-l md:shadow-none lg:w-[340px]"
            >
              <button
                type="button"
                onClick={() => setSheetOpen((open) => !open)}
                aria-expanded={sheetOpen}
                className="flex min-h-11 shrink-0 flex-col items-center justify-center gap-1 py-2 text-xs font-medium text-ink-muted md:hidden"
              >
                <span aria-hidden="true" className="h-1 w-10 rounded-full bg-zinc-300" />
                <span>{sheetOpen ? t('sheetHide') : t('sheetShow')}</span>
              </button>
              {/* A plain scroller around the fieldset: a scrolling <fieldset> isn't reliable in every browser. */}
              <div data-sheet-scroll className={`min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain md:block ${sheetOpen ? '' : 'hidden'}`}>
                <fieldset
                  disabled={readOnly || working !== null}
                  className="m-0 w-full min-w-0 border-0 p-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:pt-4"
                >
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) void uploadImage(file, frameTarget)
                    }}
                  />
                  <div className={selected ? 'hidden md:block' : ''}>
                    <AiFieldSummary doc={doc} labelOf={labelOf} onSelect={id => { setDrawing(false); setSelectedId(id); setAdding(null) }} />
                  </div>
                  {adding === 'image' ? (
                    <ImageSource
                      title={frameTarget ? t('frames.fillTitle') : undefined}
                      onBack={() => { setAdding(null); setFrameTarget(null) }}
                      onUpload={() => fileInput.current?.click()}
                      onLibrary={() => void openLibrary()}
                    />
                  ) : adding === 'library' ? (
                    <LibraryPicker
                      library={library}
                      error={libraryError}
                      onRetry={() => { setLibrary(null); void openLibrary() }}
                      onBack={() => setAdding('image')}
                      onPick={(asset) => {
                        if (frameTarget) fillFrameWith(frameTarget, asset.id)
                        else addImage(asset.id, 'upload', asset.width, asset.height)
                        setAdding(null)
                      }}
                    />
                  ) : selected ? (
                    <LayerPanel
                      layer={selected}
                      doc={doc}
                      label={labelOf(selected)}
                      textArea={textArea}
                      onChange={editSelected}
                      onReorder={(to) => edit(reorder(doc, selected.id, to))}
                      onRemove={remove}
                      onDuplicate={duplicate}
                      onBack={() => setSelectedId(null)}
                      cropping={cropDraft?.id === selected.id}
                      onCrop={() => (cropDraft ? finishCrop() : startCrop(selected.id))}
                      onSplit={billing ? () => setSplitOpen(true) : undefined}
                      splitDisabled={full}
                      onFrameImage={() => chooseImage(selected.id)}
                      onFrameEmpty={() => editSelected((layer) => (layer.kind === 'frame' ? emptyFrame(layer) : layer))}
                    />
                  ) : (
                    <div className="min-w-0 space-y-5">
                      {!loaded.layered && !readOnly && onMagicLayers && (
                        <section className="relative overflow-hidden rounded-xl border border-accent/25 bg-[linear-gradient(135deg,var(--color-accent-soft),#fff_70%)] p-3.5">
                          <p className="text-sm font-semibold text-ink">{t('magicCtaTitle')}</p>
                          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t('magicCtaDescription')}</p>
                          <button
                            type="button"
                            onClick={() => void close(onMagicLayers)}
                            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-deep disabled:bg-zinc-200 disabled:text-ink-soft"
                          >
                            <Sparkles size={15} aria-hidden="true" />
                            {t('magicCta')}
                          </button>
                        </section>
                      )}

                      <div role="tablist" aria-label={t('panelTabs.label')} className="grid grid-cols-4 gap-0.5 rounded-xl border border-hairline bg-zinc-50 p-0.5">
                        {PANEL_TABS.map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            role="tab"
                            id={`layer-tab-${tab}`}
                            aria-selected={panelTab === tab}
                            aria-controls="layer-tabpanel"
                            onClick={() => setPanelTab(tab)}
                            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-1 text-xs font-semibold transition-colors pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-accent ${
                              panelTab === tab ? 'bg-white text-ink shadow-[0_1px_2px_rgba(23,24,39,0.12)]' : 'text-ink-muted hover:text-ink'}`}
                          >
                            {tab === 'text' ? <Type size={14} aria-hidden="true" /> : tab === 'elements' ? <Shapes size={14} aria-hidden="true" />
                              : tab === 'images' ? <ImageIcon size={14} aria-hidden="true" /> : <Layers size={14} aria-hidden="true" />}
                            {t(`panelTabs.${tab}`)}
                          </button>
                        ))}
                      </div>

                      <div role="tabpanel" id="layer-tabpanel" aria-labelledby={`layer-tab-${panelTab}`} className="min-w-0 space-y-5">
                        {full && panelTab !== 'layers' && <p className="text-xs text-ink-muted">{t('full', { max: LAYER_LIMITS.layers })}</p>}

                        {panelTab === 'text' && (
                          <>
                            <div className="grid min-w-0">
                              <AddButton icon={<Type size={18} aria-hidden="true" />} label={t('addText')} onClick={addText} disabled={full} />
                            </div>
                            <TextStyleMenu disabled={full} onAdd={addTextPreset} />
                          </>
                        )}

                        {panelTab === 'elements' && (
                          <>
                            <ElementSearch value={elementQuery} onChange={setElementQuery} />
                            {elementQuery.trim() ? (
                              <ElementResults query={elementQuery} disabled={full} onShape={addShape} onIcon={(item, svg) => void addIcon(item, svg)} />
                            ) : (
                              <>
                                <ShapeMenu disabled={full} drawing={drawing} onAdd={addShape} onDraw={() => (drawing ? setDrawing(false) : startDrawing())} />
                                <IconMenu
                                  disabled={full}
                                  color={iconColor ?? INK[baseTone]}
                                  swatches={[...new Set([INK.light, INK.dark, ...loaded.brand.colors])].slice(0, 5)}
                                  onColor={setIconColor}
                                  onAdd={(item, svg) => void addIcon(item, svg)}
                                />
                                <FrameMenu disabled={full} onAdd={addFrame} />
                              </>
                            )}
                            {billing && (
                              <AiElementCard disabled={full} rate={billing.rate} planCredits={billing.planCredits} credits={billing.credits} trial={billing.trial} onRun={runAiElement} />
                            )}
                          </>
                        )}

                        {panelTab === 'images' && (
                          <>
                            <section>
                              <div className="grid min-w-0 grid-cols-2 gap-2">
                                <AddButton icon={<ImagePlus size={18} aria-hidden="true" />} label={t('addImage')} onClick={() => chooseImage(null)} disabled={full} />
                                <AddButton icon={<Stamp size={18} aria-hidden="true" />} label={t('addLogo')} onClick={() => void addLogo()} disabled={full} />
                              </div>
                              {!full && (
                                <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-muted">
                                  <ClipboardPaste size={13} aria-hidden="true" className="mt-px shrink-0 text-ink-soft" />
                                  <span>{t('frames.pasteHint')}</span>
                                </p>
                              )}
                            </section>
                            <OverlayMenu backgroundUrl={layerImageUrl(background)} disabled={full} onAdd={addOverlay} />
                          </>
                        )}

                        {panelTab === 'layers' && (
                          <section>
                            <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">{t('layers')}</h3>
                            {doc.layers.length === 0 ? (
                              <p className="rounded-lg border border-dashed border-hairline px-3 py-4 text-center text-xs leading-relaxed text-ink-muted">{t('noLayers')}</p>
                            ) : (
                              <ul className="min-w-0 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
                                {[...doc.layers].reverse().map((layer) => (
                                  <li key={layer.id}>
                                    <button
                                      type="button"
                                      onClick={() => { setDrawing(false); setSelectedId(layer.id) }}
                                      className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm transition-colors hover:bg-zinc-50 disabled:text-ink"
                                    >
                                      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-ink-muted">
                                        {layer.kind === 'text' ? <Type size={14} /> : layer.kind === 'shape' || layer.kind === 'path' ? <Shapes size={14} /> : layer.kind === 'frame' ? <FrameIcon size={14} /> : layer.role === 'logo' ? <Stamp size={14} /> : <ImageIcon size={14} />}
                                      </span>
                                      <span className="min-w-0 flex-1 truncate">{labelOf(layer)}</span>
                                      {layer.locked && <LockKeyhole size={14} aria-label={t('lockedLayer')} />}
                                      {layer.hidden && <EyeOff size={14} aria-label={t('hiddenLayer')} />}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </section>
                        )}
                      </div>

                      {(loaded.hasOriginal || loaded.fromMagic) && (
                        <section className="space-y-1 border-t border-hairline pt-4">
                          {loaded.fromMagic && (
                            <button type="button" onClick={() => void feedback()} disabled={feedbackSent} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm text-ink-muted transition-colors hover:bg-zinc-50 hover:text-ink disabled:text-emerald-700 disabled:hover:bg-transparent">
                              <Flag size={15} aria-hidden="true" />
                              {feedbackSent ? t('feedbackSent') : t('feedback')}
                            </button>
                          )}
                          {loaded.hasOriginal && (
                            <button type="button" onClick={() => void reset()} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm text-red-700 transition-colors hover:bg-red-50">
                              <RotateCcw size={15} aria-hidden="true" />
                              {t('reset')}
                            </button>
                          )}
                        </section>
                      )}
                    </div>
                  )}
                </fieldset>
              </div>
            </aside>
          </div>
        )}
      </div>
      {splitOpen && billing && doc && (
        <SplitObjectDialog
          backgroundAssetId={background}
          layerAssetId={selected?.kind === 'image' ? selected.assetId : null}
          backgroundLocked={swapped !== null}
          rate={billing.rate}
          planCredits={billing.planCredits}
          credits={billing.credits}
          trial={billing.trial}
          onRun={runSplit}
          onCancelRun={() => void cancelSplit()}
          cancelling={cancellingSplit}
          onClose={() => setSplitOpen(false)}
        />
      )}
    </dialog>
  )
}

function Banner({ tone, children }: { tone: 'info' | 'warning' | 'error'; children: ReactNode }) {
  const style = {
    info: 'border-hairline bg-white text-ink',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-800',
  }[tone]
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`mx-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-sm shadow-[0_1px_2px_rgba(23,24,39,0.04)] ${style}`}>
      {children}
    </p>
  )
}

function AddButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-hairline bg-white px-2 text-xs font-medium text-ink transition-[colors,transform] hover:-translate-y-px hover:border-accent/40 hover:bg-accent-soft/40 hover:text-accent disabled:translate-y-0 disabled:border-hairline disabled:bg-white disabled:text-ink-soft"
    >
      {icon}
      {label}
    </button>
  )
}

function AiFieldSummary({ doc, labelOf, onSelect }: { doc: LayerDoc; labelOf: (layer: Layer) => string; onSelect: (id: string) => void }) {
  const t = useTranslations('editor.layerEditor')
  const fields = doc.layers.filter(layer => layer.field && layer.field.mode !== 'static')
  const ready = fields.filter(layer => fieldReady(layer.field)).length
  return <details open className="mb-5 border-b border-hairline pb-4">
    <summary className="cursor-pointer text-sm font-semibold">{t('aiField')} <span className="text-ink-muted">({fields.length})</span></summary>
    <p className="mt-2 text-xs leading-relaxed text-ink-muted">{fields.length ? t('fieldsReady', { ready, total: fields.length }) : t('fieldsEmpty')}</p>
    {fields.length > 0 && <ul className="mt-2 space-y-1">
      {fields.map(layer => <li key={layer.id}><button type="button" onClick={() => onSelect(layer.id)}
        className="flex min-h-11 w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-zinc-50">
        {fieldReady(layer.field) ? <Sparkles size={15} className="mt-0.5 shrink-0 text-green-700" aria-hidden="true" />
          : <TriangleAlert size={15} className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />}
        <span className="min-w-0"><span className="block truncate text-xs font-medium">{labelOf(layer)}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-muted">{fieldReady(layer.field)
            ? layer.field && 'prompt' in layer.field ? layer.field.prompt : t('fieldReady') : t('fieldNeedsPrompt')}</span></span>
      </button></li>)}
    </ul>}
  </details>
}

interface LayerPanelProps {
  layer: Layer
  doc: LayerDoc
  label: string
  textArea: React.RefObject<HTMLTextAreaElement | null>
  onChange: (change: (layer: Layer) => Layer, key?: string) => void
  onReorder: (to: Reorder) => void
  onRemove: () => void
  onDuplicate: () => void
  onBack: () => void
  /** Potong is on for this image. */
  cropping: boolean
  onCrop: () => void
  /** Pisahkan objek; unset hides it. */
  onSplit?: () => void
  splitDisabled: boolean
  /** Bingkai: pick a picture for it (or another one). */
  onFrameImage: () => void
  /** Bingkai: take its picture out, back to the placeholder. */
  onFrameEmpty: () => void
}

/** The selected layer's properties: text grouped as Huruf / Paragraf / Efek, images get their opacity. */
function LayerPanel({
  layer, doc, label, textArea, onChange, onReorder, onRemove, onDuplicate, onBack, cropping, onCrop, onSplit, splitDisabled,
  onFrameImage, onFrameEmpty,
}: LayerPanelProps) {
  const t = useTranslations('editor.layerEditor')
  const index = doc.layers.findIndex((item) => item.id === layer.id)
  const last = doc.layers.length - 1
  const text = layer.kind === 'text' ? layer : null
  const setText = (change: Partial<TextLayer>, key?: string) =>
    onChange((current) => (current.kind === 'text' ? { ...current, ...change } : current), key)
  const setOpacity = (opacity: number) =>
    onChange((current) => ({ ...current, opacity }) as Layer, 'opacity')

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onBack} aria-label={t('back')} className="-ml-2 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-zinc-100 hover:text-ink">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</p>
      </div>

      {text && <div>
        <label htmlFor="layer-text" className={LABEL}>{t('text')}</label>
        <textarea id="layer-text" ref={textArea} value={text.text} disabled={layer.locked}
          maxLength={LAYER_LIMITS.text} rows={3}
          onChange={event => setText({ text: event.target.value }, 'text')}
          className={`${FIELD} max-h-40 min-h-20 resize-none text-base md:text-sm [field-sizing:content]`} />
      </div>}

      <label className="block">
        <span className={LABEL}>{t('layerName')}</span>
        <input value={layer.name ?? ''} placeholder={label} maxLength={120} disabled={layer.locked}
          onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }), 'name')} className={FIELD} />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(layer.locked)}
          onChange={(event) => onChange((current) => ({ ...current, locked: event.target.checked }))} />{t('lockedLayer')}</label>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(layer.hidden)} disabled={layer.locked}
          onChange={(event) => onChange((current) => ({ ...current, hidden: event.target.checked }))} />{t('hiddenLayer')}</label>
      </div>

      <fieldset disabled={layer.locked} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
      {(layer.kind === 'text' || layer.kind === 'image') && <Group title={t('aiField')}>
        <label className="block"><span className={LABEL}>{t('fieldMode')}</span>
          <select className={FIELD} value={layer.field?.mode ?? 'static'} onChange={event => onChange(current => ({ ...current,
            field: event.target.value === 'static' ? { kind: layer.kind, mode: 'static' }
              : layer.kind === 'text' ? { kind: 'text', mode: 'ai', prompt: '', length: 'auto' }
                : { kind: 'image', mode: 'ai_generate', prompt: '' },
          }))}>
            <option value="static">{t('fieldStatic')}</option>
            <option value={layer.kind === 'text' ? 'ai' : 'ai_generate'}>{t(layer.kind === 'text' ? 'fieldAiText' : 'fieldAiImage')}</option>
          </select>
        </label>
        {layer.field && (layer.field.mode === 'ai' || layer.field.mode === 'ai_generate') && <>
          <label className="block"><span className={LABEL}>{t('fieldPrompt')}</span>
            <textarea rows={3} maxLength={FIELD_PROMPT_LIMIT} className={FIELD} value={layer.field.prompt}
              onChange={event => onChange(current => current.field && 'prompt' in current.field
                ? { ...current, field: { ...current.field, prompt: event.target.value } } : current, 'fieldPrompt')} />
          </label>
          {!fieldReady(layer.field) && <p className="text-xs text-red-700">{t('fieldNeedsPrompt')}</p>}
          {layer.kind === 'text' && layer.field.mode === 'ai' && <>
            <label className="block"><span className={LABEL}>{t('fieldLength')}</span>
              <select className={FIELD} value={layer.field.length} onChange={event => {
                const length = event.target.value as 'auto' | 'short' | 'medium' | 'long'
                onChange(current => current.field?.mode === 'ai' ? { ...current, field: { ...current.field, length } } : current)
              }}>
                {(['auto', 'short', 'medium', 'long'] as const).map(value => <option key={value} value={value}>{t(`fieldLengths.${value}`)}</option>)}
              </select>
            </label>
            <p className="text-xs text-ink-muted">{t('fieldCapacity', { count: fieldMaxChars(layer.w, layer.h, layer.size, layer.lineHeight, layer.field.length) })}</p>
          </>}
          <p className="text-xs leading-relaxed text-ink-muted">{t('fieldExampleHint')}</p>
        </>}
      </Group>}
      <Group title={t('position')}>
        <div className="grid grid-cols-2 gap-2">
          {(['x', 'y', 'w', 'h', 'rotation'] as const).map((key) => (
            <label key={key} className="block min-w-0">
              <span className={LABEL}>{t(`coordinates.${key}`)}</span>
              <input type="number" value={Math.round((layer[key] ?? 0) * 100) / 100} className={FIELD}
                min={key === 'rotation' ? -360 : key === 'w' || key === 'h' ? 1 : undefined}
                max={key === 'rotation' ? 360 : undefined} step={1}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (!Number.isFinite(value)) return
                  if (key === 'rotation' && (value < -360 || value > 360)) return
                  if ((key === 'w' || key === 'h') && (value < 1 || value > (key === 'w' ? doc.width : doc.height) * 4)) return
                  onChange((current) => key === 'rotation' ? { ...current, rotation: value }
                    : nudgeLayer({ ...current, [key]: value }, 0, 0, doc), key)
                }} />
            </label>
          ))}
        </div>
      </Group>

      {(layer.kind === 'shape' || layer.kind === 'path') && (() => {
        const line = layer.kind === 'shape' && isLineKind(layer.shape)
        const showFill = layer.kind === 'shape' ? !line : layer.fill
        const setPaint = (change: Partial<Omit<ShapeLayer, 'kind'> & Omit<PathLayer, 'kind'>>, key?: string) =>
          onChange((current) => current.kind === 'shape' || current.kind === 'path' ? { ...current, ...change } as Layer : current, key)
        return <Group title={layer.kind === 'path' ? t('shapes.path') : t(line ? 'shapeGroups.line' : 'shapeGroups.shape')}>
          {layer.kind === 'path' && <div className="space-y-1">
            <Switch label={t('pathFill')} checked={layer.fill} onChange={(fill) => setPaint(!fill && layer.strokeWidth === 0 ? { fill, strokeWidth: 6 } : { fill })} />
            <Switch label={t('pathClosed')} checked={layer.closed} onChange={(closed) => onChange((current) => {
              if (current.kind !== 'path') return current
              // The closing segment can change the drawn extent: refit the box around it.
              const normal = normalizePath(pathPointsAbsolute(current), closed)
              return normal ? { ...current, ...normal.box, points: normal.points, closed } : { ...current, closed }
            })} />
          </div>}
          {showFill && (
            <FillControl id="shape-fill" label={t('fill.label')} fill={{ color: layer.color, gradient: layer.gradient }}
              onChange={(fill, key) => onChange((current) => withFill(current, fill), key)} />
          )}
          <ColorField label={t('strokeColor')} value={layer.strokeColor} onChange={(strokeColor) => setPaint({ strokeColor }, 'strokeColor')} />
          <Slider id="shape-stroke" label={t('strokeWidth')} min={line ? 1 : 0} max={100} step={1} value={layer.strokeWidth} display={`${layer.strokeWidth}px`}
            onChange={(strokeWidth) => setPaint({ strokeWidth }, 'strokeWidth')} />
          <div>
            <span id="shape-dash-label" className={LABEL}>{t('strokeStyle')}</span>
            <div role="radiogroup" aria-labelledby="shape-dash-label" className="grid grid-cols-3 gap-0.5 rounded-lg border border-hairline bg-zinc-50 p-0.5">
              {([undefined, 'dashed', 'dotted'] as const).map((dash) => {
                const on = layer.dash === dash
                const name = t(`strokeStyles.${dash ?? 'solid'}`)
                return (
                  <button key={dash ?? 'solid'} type="button" role="radio" aria-checked={on} title={name}
                    onClick={() => onChange((current) => withDash(current, dash))}
                    className={`flex min-h-9 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 ${
                      on ? 'bg-white text-accent shadow-[0_1px_2px_rgba(23,24,39,0.12)]' : 'text-ink-muted hover:text-ink'}`}>
                    <DashIcon dash={dash} />
                    <span className="truncate">{name}</span>
                  </button>
                )
              })}
            </div>
            {layer.strokeWidth === 0 && <p className="mt-1 text-[11px] text-ink-soft">{t('strokeStyleHint')}</p>}
          </div>
          {layer.kind === 'shape' && layer.shape === 'rect' && <Slider id="shape-radius" label={t('radius')} min={0} max={Math.min(1000, layer.w / 2, layer.h / 2)} step={1}
            value={layer.radius} display={`${layer.radius}px`} onChange={(radius) => setPaint({ radius }, 'radius')} />}
          {layer.kind === 'path' && <p className="text-[11px] leading-relaxed text-ink-soft">{t('pathEditHint')}</p>}
          <OpacitySlider value={layer.opacity ?? 1} onChange={setOpacity} />
        </Group>
      })()}

      {text && (
        <>
          <Group title={t('groups.type')}>
            <FontPicker
              id="layer-font"
              label={t('font')}
              labelClassName={LABEL}
              value={text.font}
              onChange={(font) => isFontName(font) && setText({ font })}
              className="h-10 rounded-lg border border-hairline bg-white px-2.5 text-sm text-ink hover:border-zinc-300"
            />
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_5rem] gap-2">
              <div className="min-w-0">
                <label htmlFor="layer-weight" className={LABEL}>{t('weight')}</label>
                <select
                  id="layer-weight"
                  value={text.weight}
                  onChange={(event) => setText({ weight: Number(event.target.value) as TextWeight })}
                  className={`${FIELD} h-10 py-0`}
                >
                  {TEXT_WEIGHTS.map((weight) => (
                    <option key={weight} value={weight}>{t(`weights.${WEIGHT_NAME[weight]}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="layer-size" className={LABEL}>{t('size')}</label>
                <input
                  id="layer-size"
                  type="number"
                  inputMode="numeric"
                  min={LAYER_LIMITS.size.min}
                  max={LAYER_LIMITS.size.max}
                  value={Math.round(text.size)}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isFinite(value) && value >= LAYER_LIMITS.size.min && value <= LAYER_LIMITS.size.max) setText({ size: value }, 'size')
                  }}
                  className={`${FIELD} h-10 py-0 tabular-nums`}
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <div role="group" aria-label={t('groups.type')} className="inline-flex rounded-lg border border-hairline bg-zinc-50 p-0.5">
                <Toggle label={t('bold')} on={text.weight >= 700} onClick={() => setText({ weight: text.weight >= 700 ? 400 : 700 })}>
                  <Bold size={16} aria-hidden="true" />
                </Toggle>
                <Toggle label={t('italic')} on={Boolean(text.italic)} onClick={() => setText({ italic: !text.italic })}>
                  <Italic size={16} aria-hidden="true" />
                </Toggle>
                <Toggle label={t('underline')} on={Boolean(text.underline)} onClick={() => setText({ underline: !text.underline })}>
                  <Underline size={16} aria-hidden="true" />
                </Toggle>
                <Toggle label={t('uppercase')} on={Boolean(text.uppercase)} onClick={() => setText({ uppercase: !text.uppercase })}>
                  <CaseUpper size={17} aria-hidden="true" />
                </Toggle>
              </div>
            </div>
            <FillControl id="text-fill" label={t('fill.label')} fill={{ color: text.color, gradient: text.gradient }}
              onChange={(fill, key) => onChange((current) => withFill(current, fill), key)} />
          </Group>

          <Group title={t('groups.paragraph')}>
            <div role="group" aria-label={t('align')} className="inline-flex rounded-lg border border-hairline bg-zinc-50 p-0.5">
              {(['left', 'center', 'right'] as TextAlign[]).map((align) => {
                const Icon = align === 'left' ? TextAlignStart : align === 'center' ? TextAlignCenter : TextAlignEnd
                return (
                  <Toggle key={align} label={t(`aligns.${align}`)} on={text.align === align} onClick={() => setText({ align })}>
                    <Icon size={16} aria-hidden="true" />
                  </Toggle>
                )
              })}
            </div>
            <Slider
              id="layer-line-height"
              label={t('lineSpacing')}
              min={LAYER_LIMITS.lineHeight.min}
              max={LAYER_LIMITS.lineHeight.max}
              step={0.05}
              value={text.lineHeight}
              display={text.lineHeight.toFixed(2)}
              onChange={(lineHeight) => setText({ lineHeight }, 'lineHeight')}
            />
            <Slider
              id="layer-letter-spacing"
              label={t('letterSpacing')}
              min={LAYER_LIMITS.letterSpacing.min}
              max={LAYER_LIMITS.letterSpacing.max}
              step={0.01}
              value={text.letterSpacing ?? 0}
              display={`${Math.round((text.letterSpacing ?? 0) * 100)}%`}
              onChange={(letterSpacing) => setText({ letterSpacing }, 'letterSpacing')}
            />
          </Group>

          <Group title={t('groups.effects')}>
            <OpacitySlider value={text.opacity ?? 1} onChange={setOpacity} />
            <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 text-sm text-ink">
              {t('shadow')}
              <input
                type="checkbox"
                role="switch"
                checked={Boolean(text.shadow)}
                onChange={(event) => setText({ shadow: event.target.checked })}
                className="peer sr-only"
              />
              <span aria-hidden="true" className="relative h-6 w-10 shrink-0 rounded-full bg-zinc-200 transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
            </label>
          </Group>
        </>
      )}

      {layer.kind === 'frame' && (() => {
        const setFrame = (change: Partial<FrameLayer>, key?: string) =>
          onChange((current) => (current.kind === 'frame' ? { ...current, ...change } : current), key)
        return <Group title={t('frames.title')}>
          {layer.assetId ? (
            <div className="grid min-w-0 grid-cols-2 gap-2">
              {/* The picture in the frame, next to Atur posisi: what Ganti / Hapus act on. */}
              <div className="col-span-2 flex min-w-0 items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={layerImageUrl(layer.assetId)} alt="" draggable={false}
                  className="size-10 shrink-0 rounded-md bg-zinc-100 object-cover ring-1 ring-hairline pointer-coarse:size-11" />
                <button type="button" data-crop-ui="" onClick={onCrop} aria-pressed={cropping}
                  className={`${CHIP} min-w-0 flex-1 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${cropping ? 'border-accent bg-accent text-white hover:bg-accent-deep' : ''}`}>
                  <Move size={15} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{cropping ? t('cropping.done') : t('frames.reposition')}</span>
                </button>
              </div>
              <button type="button" onClick={onFrameImage} disabled={cropping}
                className={`${CHIP} min-w-0 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent`}>
                <Replace size={15} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{t('frames.replace')}</span>
              </button>
              <button type="button" onClick={onFrameEmpty} disabled={cropping}
                className={`${CHIP} min-w-0 pointer-coarse:min-h-11 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:hover:text-ink-soft`}>
                <ImageMinus size={15} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{t('frames.removeImage')}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-accent/35 bg-accent-soft/25 px-3 py-4 text-center">
              <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-white text-accent shadow-[0_1px_2px_rgba(23,24,39,0.1)] ring-1 ring-accent/15">
                <ImagePlus size={18} />
              </span>
              <p className="text-xs leading-relaxed text-ink-muted">{t('frames.emptyHint')}</p>
              <button type="button" onClick={onFrameImage}
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-white transition-colors hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none pointer-coarse:min-h-11">
                {t('frames.fill')}
              </button>
            </div>
          )}
          <ColorField label={t('strokeColor')} value={layer.strokeColor} onChange={(strokeColor) => setFrame({ strokeColor }, 'strokeColor')} />
          <Slider id="frame-stroke" label={t('strokeWidth')} min={0} max={100} step={1} value={layer.strokeWidth} display={`${layer.strokeWidth}px`}
            onChange={(strokeWidth) => setFrame({ strokeWidth }, 'strokeWidth')} />
          {layer.shape === 'rect' && <Slider id="frame-radius" label={t('radius')} min={0} max={Math.min(1000, layer.w / 2, layer.h / 2)} step={1}
            value={layer.radius} display={`${layer.radius}px`} onChange={(radius) => setFrame({ radius }, 'radius')} />}
          <OpacitySlider value={layer.opacity ?? 1} onChange={setOpacity} />
        </Group>
      })()}

      {layer.kind === 'image' && (
        <Group title={t('groups.image')}>
          <div className={`grid min-w-0 gap-2 ${onSplit ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {/* Not "outside" the crop: pressing it while cropping is Selesai, not a new crop. */}
            <button type="button" data-crop-ui="" onClick={onCrop} aria-pressed={cropping}
              className={`${CHIP} min-w-0 ${cropping ? 'border-accent bg-accent text-white hover:bg-accent-deep' : ''}`}>
              <Crop size={15} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{cropping ? t('cropping.done') : t('cropping.start')}</span>
            </button>
            {onSplit && (
              <button type="button" onClick={onSplit} disabled={splitDisabled} aria-haspopup="dialog" className={`${CHIP} min-w-0`}>
                <Scissors size={15} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{t('split.button')}</span>
              </button>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-ink-soft">{t('imageResizeHint')}</p>
          <OpacitySlider value={layer.opacity ?? 1} onChange={setOpacity} />
        </Group>
      )}

      <div>
        <span className={LABEL}>{t('order')}</span>
        <div className="grid grid-cols-4 gap-1.5">
          <OrderButton icon={<ArrowUpToLine size={16} aria-hidden="true" />} label={t('orders.front')} onClick={() => onReorder('front')} disabled={index === last} />
          <OrderButton icon={<ChevronUp size={16} aria-hidden="true" />} label={t('orders.forward')} onClick={() => onReorder('forward')} disabled={index === last} />
          <OrderButton icon={<ChevronDown size={16} aria-hidden="true" />} label={t('orders.backward')} onClick={() => onReorder('backward')} disabled={index === 0} />
          <OrderButton icon={<ArrowDownToLine size={16} aria-hidden="true" />} label={t('orders.back')} onClick={() => onReorder('back')} disabled={index === 0} />
        </div>
      </div>

      <button type="button" onClick={onRemove} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:border-hairline disabled:text-ink-soft">
        <Trash2 size={15} aria-hidden="true" />
        {t('remove')}
      </button>
      </fieldset>
      <button type="button" onClick={onDuplicate} disabled={doc.layers.length >= LAYER_LIMITS.layers} className={`${CHIP} w-full`}>
        <Copy size={15} aria-hidden="true" />{t('duplicate')}
      </button>
      <p className="hidden text-[11px] leading-relaxed text-ink-soft md:block">{t('keys')}</p>
    </div>
  )
}

/** A shape or path with its stroke solid (no `dash` key at all, as stored docs expect) or dashed / dotted. */
function withDash(layer: Layer, dash: StrokeDash | undefined): Layer {
  if (layer.kind !== 'shape' && layer.kind !== 'path') return layer
  const next = { ...layer }
  if (dash) next.dash = dash
  else delete next.dash
  return next
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 text-sm text-ink">
      {label}
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className="relative h-6 w-10 shrink-0 rounded-full bg-zinc-200 transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  )
}

/** A swatch with its hex, opening the system colour picker (like the text colour). */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3 border-t border-hairline pt-3">
      <h3 className="text-[11px] font-semibold tracking-wide text-ink-soft uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Toggle({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex size-9 items-center justify-center rounded-md transition-colors pointer-coarse:size-10 ${on ? 'bg-white text-accent shadow-[0_1px_2px_rgba(23,24,39,0.12)]' : 'text-ink-muted hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function Slider({ id, label, min, max, step, value, display, onChange }: {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-ink-muted">{label}</label>
        <output htmlFor={id} className="text-xs font-medium text-ink tabular-nums">{display}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next * 100) / 100)))
        }}
        className="block h-8 w-full min-w-0 cursor-pointer accent-[var(--color-accent)]"
      />
    </div>
  )
}

function OpacitySlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const t = useTranslations('editor.layerEditor')
  return (
    <Slider
      id="layer-opacity"
      label={t('opacity')}
      min={LAYER_LIMITS.opacity.min}
      max={LAYER_LIMITS.opacity.max}
      step={0.05}
      value={value}
      display={`${Math.round(value * 100)}%`}
      onChange={onChange}
    />
  )
}

/** Gambar: the owner's own file, or one already in Aset. */
function ImageSource({ title, onBack, onUpload, onLibrary }: { title?: string; onBack: () => void; onUpload: () => void; onLibrary: () => void }) {
  const t = useTranslations('editor.layerEditor')
  const option = 'flex min-h-16 w-full min-w-0 items-center gap-3 rounded-xl border border-hairline bg-white px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft/30 disabled:text-ink-soft'
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onBack} aria-label={t('back')} className="-ml-2 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-zinc-100 hover:text-ink">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold">{title ?? t('imageSource')}</p>
      </div>
      <button type="button" onClick={onUpload} className={option}>
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Upload size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{t('uploadDevice')}</span>
          <span className="block text-xs text-ink-muted">{t('uploadDeviceHint')}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-ink-soft" aria-hidden="true" />
      </button>
      <button type="button" onClick={onLibrary} className={option}>
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-ink-muted">
          <ImageIcon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{t('fromLibrary')}</span>
          <span className="block text-xs text-ink-muted">{t('fromLibraryHint')}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-ink-soft" aria-hidden="true" />
      </button>
    </div>
  )
}

function OrderButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`${CHIP} px-0`}>
      {icon}
    </button>
  )
}

function LibraryPicker({ library, error, onRetry, onBack, onPick }: {
  library: Asset[] | null
  error: string | null
  onRetry: () => void
  onBack: () => void
  onPick: (asset: Asset) => void
}) {
  const t = useTranslations('editor.layerEditor')
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onBack} aria-label={t('back')} className="-ml-2 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-zinc-100 hover:text-ink">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold">{t('pickImage')}</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error} <button type="button" onClick={onRetry} className="underline">{t('retry')}</button>
        </p>
      ) : !library ? (
        <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
          {t('loading')}
        </p>
      ) : library.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('libraryEmpty')}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {library.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => onPick(asset)}
                aria-label={t('pickThis')}
                className="block w-full overflow-hidden rounded-lg border-2 border-transparent transition-colors hover:border-accent focus-visible:border-accent"
              >
                <Thumbnail id={asset.id} src={asset.url} size={256} className="aspect-square w-full bg-zinc-100 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
