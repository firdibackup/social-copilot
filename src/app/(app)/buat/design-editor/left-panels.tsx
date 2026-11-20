'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowRight, Circle, Eye, EyeOff, ImagePlus, Lock, LockOpen, Minus, Plus, RectangleHorizontal, Square, Triangle, Type } from 'lucide-react'
import { fontFamilyOf } from '@/components/font-previews'
import type { CanvasTemplateSummary } from '@/lib/canvas-templates'
import type { DesignDoc, DesignNode, DesignPage, ShapeNode } from '@/lib/design-doc'
import { renderDesignCanvas } from '@/lib/design-browser'
import { clonePage } from '@/lib/design-operations'
import { newImageNode, newShapeNode, newTextNode, type NewShape, type NewText } from '@/lib/design-nodes'
import { prepareLayerUpload } from '@/lib/layer-canvas'
import { layerImageUrl } from '@/lib/layer-doc'
import { STARTER_CATEGORIES, STARTER_TEMPLATES, starterFormatOf, starterPage } from '@/lib/starter-templates'
import { getCanvasTemplateAction, listCanvasTemplatesAction } from '../canvas-template-actions'
import { logoLayerAssetAction, uploadLayerImageAction } from '../layer-actions'

export type PanelKey = 'templates' | 'elements' | 'text' | 'uploads' | 'layers'
const familyOf = (name: string) => fontFamilyOf(name) ?? 'sans-serif'
const HEADING = 'px-4 pt-4 pb-2 text-[11px] font-semibold tracking-wider text-ink-muted uppercase'
const TILE = 'flex flex-col items-center justify-center gap-1 rounded-xl border border-hairline bg-white p-2 text-[11px] text-ink-muted hover:border-accent hover:text-accent'

interface Props {
  panel: PanelKey; page: DesignPage; doc: DesignDoc; selected: DesignNode | null
  onInsertNode: (node: DesignNode, message: string) => void
  onInsertPages: (pages: DesignPage[], replace: boolean) => void
  onSelect: (id: string | null) => void
  onEdit: (nodeId: string, changes: Partial<DesignNode>) => void
  onReorder: (nodeId: string, to: 'front' | 'back' | 'forward' | 'backward') => void
  onError: (message: string) => void
  notify: (message: string) => void
}

export function LeftPanel(props: Props) {
  if (props.panel === 'templates') return <TemplatesPanel {...props} />
  if (props.panel === 'elements') return <ElementsPanel {...props} />
  if (props.panel === 'text') return <TextPanel {...props} />
  if (props.panel === 'uploads') return <UploadsPanel {...props} />
  return <LayersPanel {...props} />
}

/** A rendered thumbnail of a page, drawn once with the same renderer as the canvas. */
function PageThumb({ page, className = '' }: { page: DesignPage; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let live = true
    const doc: DesignDoc = { format: 'carousely.design', schemaVersion: 1, id: page.id, title: '', unit: 'px', dpi: 96, pages: [page], assets: [], fonts: [], meta: {} }
    const scale = 220 / page.width
    void renderDesignCanvas(doc, 0, familyOf, scale).then(image => {
      const target = ref.current
      if (!live || !target) return
      target.width = image.width
      target.height = image.height
      target.getContext('2d')?.drawImage(image, 0, 0)
    }).catch(() => undefined)
    return () => { live = false }
  }, [page])
  return <canvas ref={ref} className={`w-full rounded-lg bg-zinc-100 ${className}`} style={{ aspectRatio: `${page.width} / ${page.height}` }} />
}

function TemplatesPanel({ page, onInsertPages, onError }: Props) {
  const t = useTranslations('editor.designEditor')
  const locale = useLocale()
  const [replace, setReplace] = useState(false)
  const [mine, setMine] = useState<CanvasTemplateSummary[] | null>(null)
  const format = starterFormatOf(page) ?? '4:5'
  useEffect(() => { listCanvasTemplatesAction().then(setMine).catch(() => setMine([])) }, [])
  // Memoised: a new page object would redraw every thumbnail on each render.
  const starters = useMemo(() => STARTER_TEMPLATES.map(item => ({ ...item, page: starterPage(item.id, format, item.name[locale === 'en' ? 'en' : 'id']) })), [format, locale])
  return <div className="pb-6">
    <div className="space-y-2 p-4">
      <button type="button" onClick={() => onInsertPages([{ id: crypto.randomUUID(), name: 'Slide', width: page.width, height: page.height,
        background: { type: 'solid', color: { srgb: { r: 1, g: 1, b: 1, a: 1 } } }, children: [] }], replace)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 text-sm font-medium hover:border-accent hover:text-accent">
        <Plus size={16} />{t('startFresh')}
      </button>
      <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 text-xs font-medium">
        {[false, true].map(value => <button key={String(value)} type="button" role="radio" aria-checked={replace === value} onClick={() => setReplace(value)}
          className={`rounded-md px-2 py-1.5 ${replace === value ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'}`}>{value ? t('insertReplace') : t('insertAdd')}</button>)}
      </div>
    </div>
    <p className={HEADING}>{t('mine')}</p>
    <div className="grid grid-cols-2 gap-2 px-4">
      {mine?.length === 0 && <p className="col-span-2 text-xs text-ink-muted">{t('mineEmpty')}</p>}
      {mine?.map(item => <button key={item.id} type="button" className="text-left text-[11px] text-ink-muted hover:text-ink" onClick={async () => {
        const result = await getCanvasTemplateAction(item.id).catch(() => null)
        if (!result || !('template' in result) || !result.template) { onError(t('loadFailed')); return }
        onInsertPages(result.template.doc.pages.slice(0, 10).map(source => clonePage(source)), replace)
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.previewAssetId ? <img src={layerImageUrl(item.previewAssetId)} alt="" className="mb-1 w-full rounded-lg bg-zinc-100 object-cover" />
          : <span className="mb-1 block aspect-[4/5] rounded-lg bg-zinc-100" />}
        <span className="line-clamp-1">{item.name}</span>
      </button>)}
    </div>
    <p className={HEADING}>{t('defaults')}</p>
    {STARTER_CATEGORIES.map(category => <section key={category} className="px-4 pb-3">
      <h4 className="pb-2 text-xs font-semibold text-ink">{t(`categories.${category}`)}</h4>
      <div className="grid grid-cols-2 gap-2">
        {starters.filter(item => item.category === category).map(item => <button key={item.id} type="button" title={item.page.name}
          onClick={() => onInsertPages([clonePage(item.page)], replace)} className="group text-left text-[11px] text-ink-muted">
          <PageThumb page={item.page} className="ring-accent group-hover:ring-2" />
          <span className="mt-1 line-clamp-1 group-hover:text-ink">{item.page.name.split('·').at(-1)?.trim()}</span>
        </button>)}
      </div>
    </section>)}
  </div>
}

const SHAPES: { kind: NewShape; icon: typeof Square }[] = [
  { kind: 'rect', icon: Square }, { kind: 'rounded', icon: RectangleHorizontal }, { kind: 'ellipse', icon: Circle },
  { kind: 'triangle', icon: Triangle }, { kind: 'line', icon: Minus }, { kind: 'arrow', icon: ArrowRight }, { kind: 'photo', icon: ImagePlus },
]
function ElementsPanel({ page, onInsertNode }: Props) {
  const t = useTranslations('editor.designEditor')
  return <div className="pb-6">
    <p className={HEADING}>{t('shapes')}</p>
    <div className="grid grid-cols-3 gap-2 px-4">
      {SHAPES.map(({ kind, icon: Icon }) => <button key={kind} type="button" className={`${TILE} aspect-square`}
        onClick={() => onInsertNode(newShapeNode(page, kind, crypto.randomUUID(), t(`shapeNames.${kind}`)), t(`shapeNames.${kind}`))}>
        <Icon size={28} strokeWidth={1.5} aria-hidden="true" />{t(`shapeNames.${kind}`)}
      </button>)}
    </div>
  </div>
}

function TextPanel({ page, onInsertNode }: Props) {
  const t = useTranslations('editor.designEditor')
  const add = (kind: NewText) => {
    const label = { heading: t('heading'), subheading: t('subheading'), body: t('body') }[kind]
    onInsertNode(newTextNode(page, kind, label, crypto.randomUUID()), t(kind === 'heading' ? 'addHeading' : kind === 'subheading' ? 'addSubheading' : 'addBody'))
  }
  return <div className="space-y-2 p-4">
    <button type="button" onClick={() => add('body')} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-deep">
      <Type size={16} />{t('addBody')}
    </button>
    <button type="button" onClick={() => add('heading')} className="w-full rounded-xl border border-hairline px-4 py-3 text-left text-2xl font-extrabold hover:border-accent">{t('addHeading')}</button>
    <button type="button" onClick={() => add('subheading')} className="w-full rounded-xl border border-hairline px-4 py-3 text-left text-lg font-semibold hover:border-accent">{t('addSubheading')}</button>
    <button type="button" onClick={() => add('body')} className="w-full rounded-xl border border-hairline px-4 py-3 text-left text-sm hover:border-accent">{t('addBody')}</button>
  </div>
}

function UploadsPanel({ page, selected, onInsertNode, onEdit, onError }: Props) {
  const t = useTranslations('editor.designEditor')
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  /** A photo slot that is selected gets the upload as its fill, so the layout is kept; otherwise a new image layer. */
  const slot = selected?.type === 'shape' && selected.kind === 'rect' && selected.data?.carousely?.role === 'photo' ? selected as ShapeNode : null
  async function upload(file: File) {
    setBusy(true)
    try {
      const prepared = await prepareLayerUpload(file)
      const form = new FormData()
      form.set('file', prepared.blob, prepared.blob.type === 'image/png' ? 'layer.png' : 'layer.jpg')
      form.set('width', String(prepared.width))
      form.set('height', String(prepared.height))
      const result = await uploadLayerImageAction(form)
      if ('error' in result) { onError(result.error); return }
      if (slot) onEdit(slot.id, { fill: { type: 'image', assetId: result.assetId, fit: 'cover' } })
      else onInsertNode(newImageNode(page, result, crypto.randomUUID(), file.name.slice(0, 80) || 'Gambar', 'upload'), t('upload'))
    } catch { onError(t('loadFailed')) }
    finally { setBusy(false) }
  }
  return <div className="space-y-3 p-4">
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) void upload(file)
    }} />
    <button type="button" disabled={busy} onClick={() => input.current?.click()}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-deep disabled:opacity-60">
      <ImagePlus size={16} />{busy ? t('uploading') : t('upload')}
    </button>
    <p className="text-xs leading-relaxed text-ink-muted">{t('uploadHint')}</p>
    <button type="button" disabled={busy} className="flex h-11 w-full items-center justify-center rounded-xl border border-hairline text-sm font-medium hover:border-accent disabled:opacity-60"
      onClick={async () => {
        setBusy(true)
        try {
          const result = await logoLayerAssetAction()
          if ('error' in result) { onError(result.error); return }
          const node = newImageNode(page, result, crypto.randomUUID(), 'Logo', 'logo')
          node.size = { width: Math.round(node.size.width * 0.4), height: Math.round(node.size.height * 0.4) }
          node.transform = { ...node.transform, x: 72, y: 72 }
          onInsertNode(node, t('addLogo'))
        } catch { onError(t('loadFailed')) }
        finally { setBusy(false) }
      }}>{t('addLogo')}</button>
  </div>
}

const TYPE_LABEL: Record<DesignNode['type'], string> = { text: 'TEXT', image: 'IMAGE', shape: 'SHAPE', group: 'GROUP' }
function LayersPanel({ page, selected, onSelect, onEdit }: Props) {
  const t = useTranslations('editor.designEditor')
  const rows = [...page.children].reverse()
  if (!rows.length) return <p className="p-4 text-sm text-ink-muted">{t('noLayers')}</p>
  return <ul className="p-2">
    {rows.map(node => <li key={node.id}>
      <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${selected?.id === node.id ? 'bg-accent-soft' : 'hover:bg-zinc-50'}`}>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(node.id)}>
          <span className="w-12 shrink-0 text-[9px] font-semibold tracking-wider text-ink-muted">{TYPE_LABEL[node.type]}</span>
          <span className={`truncate ${node.hidden ? 'text-ink-muted line-through' : ''}`}>{node.name || node.type}</span>
        </button>
        <button type="button" aria-label={node.hidden ? t('show') : t('hide')} className="text-ink-muted hover:text-ink"
          onClick={() => onEdit(node.id, { hidden: !node.hidden })}>{node.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        <button type="button" aria-label={node.locked ? t('unlock') : t('lock')} className="text-ink-muted hover:text-ink"
          onClick={() => onEdit(node.id, { locked: !node.locked })}>{node.locked ? <Lock size={14} /> : <LockOpen size={14} />}</button>
      </div>
    </li>)}
  </ul>
}
