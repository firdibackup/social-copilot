'use client'

import { useTranslations } from 'next-intl'
import {
  ArrowDownToLine, ArrowUpToLine, Bold, CaseUpper, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Flag, Image as ImageIcon, ImagePlus,
  Italic, LoaderCircle, Redo2, RotateCcw, Sparkles, Stamp, TextAlignCenter, TextAlignEnd, TextAlignStart, Trash2, TriangleAlert, Type,
  Underline, Undo2, Upload, X, Shapes, Copy, LockKeyhole, EyeOff,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { confirmDialog } from '@/components/confirm-dialog'
import { FontPicker } from '@/components/font-picker'
import { useStorageFull } from '@/components/storage-full'
import type { Asset } from '@/lib/assets'
import { DEFAULT_HEADING_FONT } from '@/lib/design-styles'
import { FIELD_PROMPT_LIMIT, fieldMaxChars, fieldReady } from '@/lib/design-fields'
import { flattenDoc, loadFonts, prepareLayerUpload } from '@/lib/layer-canvas'
import {
  createHistory, duplicateLayer, emptyDoc, isFontName, isOutside, LAYER_LIMITS, layerDraftKey, newImageLayer, newTextLayer, newShapeLayer, redo, reorder, TEXT_WEIGHTS, undo,
  type History, type ImageLayer, type Layer, type LayerDoc, type Reorder, type TextAlign, type TextLayer, type TextWeight, type ShapeLayer,
} from '@/lib/layer-doc'
import type { PostMedia } from '@/lib/posts'
import {
  loadSlideLayersAction, logoLayerAssetAction, magicFeedbackAction, resetSlideLayersAction, saveSlideLayersAction, uploadLayerImageAction,
} from './layer-actions'
import { familyOf, fitDoc, LayerCanvas, type BaseTone } from './layer-editor-canvas'
import { addLayer, AMEND_MS, editStep, nudgeLayer, readDraft, removeLayer, sameDoc, updateLayer } from './layer-editor-gesture'
import { Thumbnail } from './thumbnail'
import { saveSlideTemplateAction } from './canvas-template-actions'
import { parseLayerDraft, serializeLayerDraft } from '@/lib/layer-draft'
import { CanvasTemplateGallery } from './canvas-template-gallery'

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
}

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
}

/** What the panel shows while adding an image: where it comes from, then the library. */
type Adding = 'image' | 'library' | 'templates' | null

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
export function LayerEditor({ postId, media, slide, slides, onSlideChange, onFlush, onClose, onMagicLayers }: LayerEditorProps) {
  const t = useTranslations('editor.layerEditor')
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
  const [templateName, setTemplateName] = useState<string | null>(null)
  const [templateSaved, setTemplateSaved] = useState(false)
  const [templateAllSlides, setTemplateAllSlides] = useState(false)
  const [templateDirty, setTemplateDirty] = useState(false)

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
  const dirty = Boolean(loaded && doc && !readOnly && !sameDoc(doc, loaded.initial))

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
    setHistory((current) => (current ? editStep(current, fitDoc(next), amend) : current))
  }

  const selected = doc?.layers.find((layer) => layer.id === selectedId) ?? null
  const editSelected = (change: (layer: Layer) => Layer, key?: string) => {
    if (doc && selected) edit(updateLayer(doc, selected.id, change), key && `${key}:${selected.id}`)
  }
  const full = (doc?.layers.length ?? 0) >= LAYER_LIMITS.layers

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
    const layer = newShapeLayer(doc, shape)
    edit(addLayer(doc, layer))
    setSelectedId(layer.id)
    setSheetOpen(true)
  }

  function addText() {
    if (!doc || full) return
    const font = doc.layers.find((layer): layer is TextLayer => layer.kind === 'text')?.font ?? DEFAULT_HEADING_FONT
    const layer = newTextLayer(doc, t('newText'), font, baseTone === 'light' ? '#171827' : '#FFFFFF')
    edit(addLayer(doc, layer))
    setSelectedId(layer.id)
    setSheetOpen(true)
    window.setTimeout(() => textArea.current?.select(), 0)
  }

  function addImage(assetId: string, role: ImageLayer['role'], width: number, height: number) {
    if (!doc || full) return
    const layer = newImageLayer(doc, assetId, role, width, height)
    edit(addLayer(doc, layer))
    setSelectedId(layer.id)
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

  async function uploadImage(file: File) {
    if (full) return
    setError(null)
    setWorking(t('uploading'))
    try {
      const prepared = await prepareLayerUpload(file)
      const form = new FormData()
      form.set('file', prepared.blob, prepared.blob.type === 'image/png' ? 'layer.png' : 'layer.jpg')
      form.set('width', String(prepared.width))
      form.set('height', String(prepared.height))
      const result = await uploadLayerImageAction(form).catch(() => ({ error: t('failed') }))
      if ('error' in result) {
        if (!storageFull(result.error)) setError(result.error)
        return
      }
      setAdding(null)
      addImage(result.assetId, 'upload', result.width, result.height)
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
    if (templateDirty && !await confirmDialog({ title: t('templateUnsaved'), confirmLabel: t('discard'), cancelLabel: t('keepEditing'), tone: 'danger' })) return
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
    if (templateDirty) { setError(t('templateUnsaved')); return }
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
    if (templateDirty) { setError(t('templateUnsaved')); return }
    if (!doc || !loaded || readOnly || working) return
    setError(null)
    setSelectedId(null)
    setWorking(t('saving'))
    try {
      if (!(await onFlush())) throw new Error(t('flushFailed'))
      const prepared = await flattenDoc(doc, loaded.baseAssetId, familyOf)
      const form = new FormData()
      form.set('file', prepared.blob, 'slide.jpg')
      form.set('width', String(prepared.width))
      form.set('height', String(prepared.height))
      form.set('postId', postId)
      form.set('oldAssetId', media.assetId)
      form.set('doc', JSON.stringify(doc))
      form.set('expectedVersion', loaded.version ?? '')
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

  async function saveTemplate() {
    if (templateDirty) { setError(t('templateUnsaved')); return }
    if (draft) { setError(t('templateRestoreDraft')); return }
    if (!doc || !loaded || working || !templateName?.trim()) return
    setWorking(t('saving'))
    setError(null)
    try {
      if (!await onFlush()) throw new Error(t('flushFailed'))
      const prepared = await flattenDoc(doc, loaded.baseAssetId, familyOf)
      const form = new FormData()
      form.set('postId', postId)
      form.set('assetId', media.assetId)
      form.set('expectedVersion', loaded.version ?? '')
      form.set('name', templateName.trim())
      form.set('allSlides', String(templateAllSlides))
      if (templateAllSlides) {
        const drafts = []
        for (const item of slides) {
          if (item.assetId === media.assetId) continue
          const raw = window.localStorage.getItem(layerDraftKey(item.assetId))
          if (!raw) continue
          const pending = parseLayerDraft(raw)
          if (!pending || pending.version === null) { setError(t('templateRestoreDraft')); return }
          drafts.push({ assetId: item.assetId, expectedVersion: pending.version, doc: pending.doc })
        }
        form.set('drafts', JSON.stringify(drafts))
      }
      form.set('doc', JSON.stringify(doc))
      form.set('file', prepared.blob, 'template.jpg')
      form.set('width', String(prepared.width))
      form.set('height', String(prepared.height))
      const result = await saveSlideTemplateAction(form)
      if ('error' in result) {
        if (!storageFull(result.error)) setError(result.error)
      } else {
        setTemplateName(null)
        setTemplateSaved(true)
      }
    } catch { setError(t('failed')) }
    finally { setWorking(null) }
  }

  async function feedback() {
    setFeedbackSent(true)
    const result = await magicFeedbackAction({ assetId: media.assetId }).catch(() => t('failed'))
    if (result) {
      setFeedbackSent(false)
      setError(result)
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (adding === 'templates') return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]') || !doc) return
    const mod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()
    if (mod && key === 'z') {
      event.preventDefault()
      stepHistory(event.shiftKey ? 'redo' : 'undo')
      return
    }
    if (mod && key === 'y') {
      event.preventDefault()
      stepHistory('redo')
      return
    }
    if (!selected || readOnly) return
    if (mod && key === 'd') {
      event.preventDefault()
      duplicate()
      return
    }
    if (mod || selected.locked) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      remove()
      return
    }
    const step = event.shiftKey ? 10 : 1
    const offset = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
    if (!offset) return
    event.preventDefault()
    editSelected((layer) => nudgeLayer(layer, offset[0], offset[1], doc), 'nudge')
  }

  const labelOf = (layer: Layer) =>
    layer.name || (layer.kind === 'text'
      ? t('textLabel', { text: layer.text.replace(/\s+/g, ' ').trim().slice(0, 40) || '…' })
      : layer.kind === 'shape' ? t(`shapes.${layer.shape}`) : t(`roles.${layer.role}`))
  const outside = doc?.layers.some((layer) => !layer.hidden && isOutside(layer, doc)) ?? false

  return (
    <dialog
      ref={dialog}
      aria-labelledby="layer-editor-heading"
      onCancel={(event) => {
        // Esc: let go of the selection first, then close.
        event.preventDefault()
        if (templateDirty) { void close(); return }
        if (adding) setAdding(null)
        else if (selectedId) setSelectedId(null)
        else void close()
      }}
      onKeyDown={onKeyDown}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-clip bg-transparent p-0 backdrop:bg-[rgba(20,21,31,0.55)]"
    >
      <div className="flex h-dvh w-full flex-col overflow-clip bg-bg text-ink">
        {/* Top bar: icons on phones, so Simpan always fits. */}
        <header className="flex h-14 shrink-0 items-center gap-0.5 border-b border-hairline bg-white pr-2 pl-1 pt-[env(safe-area-inset-top)] md:gap-1 md:px-3">
          <button type="button" onClick={() => void close()} aria-label={t('close')} title={t('close')} className={TOOL} disabled={working !== null}>
            <X size={19} aria-hidden="true" />
          </button>
          <h2 id="layer-editor-heading" className="flex min-w-0 flex-1 items-center gap-2 px-1 text-sm font-semibold md:text-base">
             <span className="truncate">{adding === 'templates' ? t('myTemplates') : t('title', { slide })}</span>
            {readOnly && loaded && <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-ink-muted">{t('viewOnly')}</span>}
          </h2>
           {adding !== 'templates' && !readOnly && history && (
            <>
              <button type="button" onClick={() => stepHistory('undo')} disabled={history.past.length === 0 || working !== null} aria-label={t('undo')} title={`${t('undo')} (Ctrl+Z)`} className={TOOL}>
                <Undo2 size={18} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => stepHistory('redo')} disabled={history.future.length === 0 || working !== null} aria-label={t('redo')} title={`${t('redo')} (Ctrl+Shift+Z)`} className={TOOL}>
                <Redo2 size={18} aria-hidden="true" />
              </button>
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

        {adding !== 'templates' && loaded && !readOnly && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline bg-white px-3 py-2">
          {templateName === null ? <button type="button" disabled={working !== null} className={CHIP}
            onClick={() => { setTemplateName(''); setTemplateSaved(false) }}>{t('saveSlideTemplate')}</button>
            : <form className="flex w-full flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void saveTemplate() }}>
              <label className="min-w-40 flex-1"><span className={LABEL}>{t('templateName')}</span>
                <input autoFocus required maxLength={120} value={templateName} onChange={event => setTemplateName(event.target.value)} disabled={working !== null} className={FIELD} />
              </label>
              <button type="submit" className={CHIP} disabled={!templateName.trim() || working !== null}>{t('save')}</button>
              <button type="button" className={CHIP} disabled={working !== null} onClick={() => setTemplateName(null)}>{t('templateCancel')}</button>
              {slides.length > 1 && <div className="w-full">
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={templateAllSlides}
                  disabled={working !== null} onChange={event => setTemplateAllSlides(event.target.checked)} />{t('templateAllSlides', { count: slides.length })}</label>
                {templateAllSlides && <p className="text-xs leading-relaxed text-ink-muted">{t('templateAllSlidesHint')}</p>}
              </div>}
            </form>}
          {templateSaved && <p role="status" className="text-xs text-green-700">{t('templateSaved')}</p>}
          <button type="button" disabled={working !== null} className={CHIP}
            onClick={() => { setAdding('templates'); setSelectedId(null); setSheetOpen(true) }}>{t('myTemplates')}</button>
        </div>}

        {adding !== 'templates' && slides.length > 1 && <nav aria-label={t('slides')} className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-hairline bg-white px-3 py-2">
          {slides.map((item, index) => <button key={item.assetId} type="button" disabled={working !== null}
            onClick={() => switchSlide(item.assetId)} aria-current={item.assetId === media.assetId ? 'page' : undefined}
            aria-label={t('openSlide', { slide: index + 1 })}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-2 py-1 text-sm disabled:opacity-50 ${item.assetId === media.assetId ? 'border-accent bg-accent/5 font-semibold text-accent-deep' : 'border-hairline hover:bg-zinc-50'}`}>
            <Thumbnail id={item.assetId} src={item.url} size={96} className="h-9 w-7 rounded object-cover" />
            <span>{index + 1}</span>
          </button>)}
          <span className="hidden shrink-0 px-2 text-xs text-ink-muted md:inline">{t('slideDraftHint')}</span>
        </nav>}

        {adding === 'templates' ? <CanvasTemplateGallery onBack={() => { setAdding(null); setError(null) }} onDirtyChange={setTemplateDirty} /> : loadError ? (
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
              {(draft || outside || readOnly || error) && (
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
                  {outside && !readOnly && (
                    <Banner tone="warning">
                      <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
                      {t('outside')}
                    </Banner>
                  )}
                  {error && <Banner tone="error">{error}</Banner>}
                </div>
              )}
              <div className="flex min-h-40 min-w-0 flex-1 p-3 md:p-8">
                <LayerCanvas
                  doc={doc}
                  baseAssetId={loaded.baseAssetId}
                  selectedId={selectedId}
                  readOnly={readOnly || working !== null}
                  labelOf={labelOf}
                  onSelect={(id) => {
                    if (templateDirty) return
                    setSelectedId(id)
                    if (id) { setAdding(null); setSheetOpen(true) }
                  }}
                  onCommit={(next) => edit(next)}
                  onEditText={() => {
                    setSheetOpen(true)
                    window.setTimeout(() => textArea.current?.focus(), 0)
                  }}
                  onBaseTone={setBaseTone}
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
                      if (file) void uploadImage(file)
                    }}
                  />
                  <div className={selected ? 'hidden md:block' : ''}>
                    <AiFieldSummary doc={doc} labelOf={labelOf} onSelect={id => { setSelectedId(id); setAdding(null) }} />
                  </div>
                  {adding === 'image' ? (
                    <ImageSource
                      onBack={() => setAdding(null)}
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
                        addImage(asset.id, 'upload', asset.width, asset.height)
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

                      <section>
                        <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">{t('add')}</h3>
                        <div className="grid min-w-0 grid-cols-3 gap-2">
                          <AddButton icon={<Type size={18} aria-hidden="true" />} label={t('addText')} onClick={addText} disabled={full} />
                          <AddButton icon={<Stamp size={18} aria-hidden="true" />} label={t('addLogo')} onClick={() => void addLogo()} disabled={full} />
                          <AddButton icon={<ImagePlus size={18} aria-hidden="true" />} label={t('addImage')} onClick={() => setAdding('image')} disabled={full} />
                        </div>
                        {full && <p className="mt-2 text-xs text-ink-muted">{t('full', { max: LAYER_LIMITS.layers })}</p>}
                      </section>

                      <section>
                        <h3 className="mb-2 text-xs font-semibold text-ink-muted">{t('addShape')}</h3>
                        <div className="flex flex-wrap gap-2">
                          {(['rect', 'ellipse', 'triangle', 'line', 'arrow'] as const).map((shape) => (
                            <button key={shape} type="button" disabled={full} onClick={() => addShape(shape)} className={CHIP}>{t(`shapes.${shape}`)}</button>
                          ))}
                        </div>
                      </section>

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
                                  onClick={() => setSelectedId(layer.id)}
                                  className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm transition-colors hover:bg-zinc-50 disabled:text-ink"
                                >
                                  <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-ink-muted">
                                    {layer.kind === 'text' ? <Type size={14} /> : layer.kind === 'shape' ? <Shapes size={14} /> : layer.role === 'logo' ? <Stamp size={14} /> : <ImageIcon size={14} />}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{labelOf(layer)}</span>
                                  {layer.locked && <LockKeyhole size={14} aria-label={t('lockedLayer')} />}
                                  {layer.hidden && <EyeOff size={14} aria-label={t('hiddenLayer')} />}
                                  {isOutside(layer, doc) && <TriangleAlert size={14} className="shrink-0 text-amber-600" aria-label={t('outsideShort')} />}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>

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
}

/** The selected layer's properties: text grouped as Huruf / Paragraf / Efek, images get their opacity. */
function LayerPanel({ layer, doc, label, textArea, onChange, onReorder, onRemove, onDuplicate, onBack }: LayerPanelProps) {
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

      {layer.kind === 'shape' && <Group title={t('addShape')}>
        <label className="block"><span className={LABEL}>{t('color')}</span><input type="color" value={layer.color}
          onChange={(event) => onChange((current) => current.kind === 'shape' ? { ...current, color: event.target.value.toUpperCase() } : current, 'color')}
          className="h-10 w-full" /></label>
        <label className="block"><span className={LABEL}>{t('strokeColor')}</span><input type="color" value={layer.strokeColor}
          onChange={(event) => onChange((current) => current.kind === 'shape' ? { ...current, strokeColor: event.target.value.toUpperCase() } : current, 'strokeColor')}
          className="h-10 w-full" /></label>
        <Slider id="shape-stroke" label={t('strokeWidth')} min={0} max={100} step={1} value={layer.strokeWidth} display={`${layer.strokeWidth}px`}
          onChange={(strokeWidth) => onChange((current) => current.kind === 'shape' ? { ...current, strokeWidth } : current, 'strokeWidth')} />
        {layer.shape === 'rect' && <Slider id="shape-radius" label={t('radius')} min={0} max={Math.min(1000, layer.w / 2, layer.h / 2)} step={1}
          value={layer.radius} display={`${layer.radius}px`} onChange={(radius) => onChange((current) => current.kind === 'shape' ? { ...current, radius } : current, 'radius')} />}
        <OpacitySlider value={layer.opacity ?? 1} onChange={setOpacity} />
      </Group>}

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
              <label className="relative ml-auto flex h-10 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-hairline bg-white pr-2.5 pl-1.5 text-xs tabular-nums">
                <span aria-hidden="true" className="size-6 shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgba(23,24,39,0.15)]" style={{ background: text.color }} />
                {text.color.toUpperCase()}
                <input
                  type="color"
                  aria-label={t('color')}
                  title={t('color')}
                  value={text.color.toLowerCase()}
                  onChange={(event) => setText({ color: event.target.value.toUpperCase() }, 'color')}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
            </div>
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

      {layer.kind === 'image' && (
        <Group title={t('groups.image')}>
          <OpacitySlider value={layer.opacity ?? 1} onChange={setOpacity} />
        </Group>
      )}

      {isOutside(layer, doc) && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
          {t('outsideLayer')}
        </p>
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
function ImageSource({ onBack, onUpload, onLibrary }: { onBack: () => void; onUpload: () => void; onLibrary: () => void }) {
  const t = useTranslations('editor.layerEditor')
  const option = 'flex min-h-16 w-full min-w-0 items-center gap-3 rounded-xl border border-hairline bg-white px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft/30 disabled:text-ink-soft'
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onBack} aria-label={t('back')} className="-ml-2 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-zinc-100 hover:text-ink">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold">{t('imageSource')}</p>
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
