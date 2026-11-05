/** Portable design documents. Asset URLs are resolved by the owner at render time, never persisted as signed URLs. */
import { isFontName, parseLayerDoc, type LayerDoc } from './layer-doc'
import { isFieldConfig, type FieldConfig } from './design-fields'
import { inspectCaption } from './caption'
export type { FieldConfig } from './design-fields'

export type Color = { srgb: { r: number; g: number; b: number; a: number } }
export type Rect = { x: number; y: number; width: number; height: number }
export type Paint =
  | { type: 'none' }
  | { type: 'solid'; color: Color }
  | { type: 'gradient'; kind: 'linear' | 'radial'; angle: number; stops: { offset: number; color: Color }[] }
  | { type: 'image'; assetId: string; fit: 'cover' | 'contain' | 'stretch'; crop?: Rect; maskAssetId?: string }
export type Effect = { kind: 'shadow'; dx: number; dy: number; blur: number; color: Color; opacity: number }
export interface BaseNode {
  id: string
  name: string
  transform: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }
  size: { width: number; height: number }
  opacity: number
  locked?: boolean
  hidden?: boolean
  decorative?: boolean
  effects?: Effect[]
  data?: { carousely?: { field?: FieldConfig; hug?: { textId: string }; role?: string } }
}
export interface TextStyle {
  fontFamily: string
  fontStyle: 'Regular' | 'Italic'
  fontSize: number
  axes: { wght: number }
  fill: Paint
  underline?: boolean
  letterSpacing?: number
  case?: 'none' | 'upper'
}
export interface TextNode extends BaseNode {
  type: 'text'
  box: { mode: 'fixed' | 'autoHeight' | 'autoWidth'; width: number; height: number;
    autoFit: { enabled: boolean; min: number; max: number }; verticalAlign: 'top' | 'middle' | 'bottom' }
  content: { runs: { text: string; style: TextStyle }[];
    style: { align: 'left' | 'center' | 'right'; direction: 'auto' | 'ltr' | 'rtl'; lineHeight: number } }[]
}
export interface ImageNode extends BaseNode { type: 'image'; fill: Extract<Paint, { type: 'image' }> }
export interface ShapeNode extends BaseNode {
  type: 'shape'
  kind: 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow'
  cornerRadius: number
  fill: Paint
  stroke?: { color: Color; width: number }
}
export interface GroupNode extends BaseNode { type: 'group'; children: DesignNode[] }
export type DesignNode = TextNode | ImageNode | ShapeNode | GroupNode
export interface DesignPage {
  id: string
  name: string
  width: number
  height: number
  background: Paint
  children: DesignNode[]
  repeat?: null | { mode: 'ai' } | { mode: 'fixed'; count: number }
}
export interface DesignDoc {
  format: 'carousely.design'
  schemaVersion: 1
  id: string
  title: string
  unit: 'px'
  dpi: 96
  pages: DesignPage[]
  assets: { id: string; kind: 'image' | 'font' }[]
  fonts: { family: string; assetId?: string }[]
  meta: { caption?: { mode: 'static'; value: string } | { mode: 'ai'; prompt: string } }
}

export const DESIGN_LIMITS = { pages: 10, nodes: 200, depth: 8, text: 10_000, pageText: 30_000, prompt: 2_000, bytes: 2_000_000 } as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// Existing assets may predate the editor's UUID v4 rule.
const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Obj = Record<string, unknown>
const object = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const keys = (v: Obj, allowed: string[]) => Object.keys(v).every((key) => allowed.includes(key))
const number = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const string = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const oneOf = (v: unknown, values: readonly unknown[]) => values.includes(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const assetId = (v: unknown): v is string => typeof v === 'string' && ASSET_ID.test(v)
function color(v: unknown): v is Color {
  if (!object(v) || !keys(v, ['srgb']) || !object(v.srgb)) return false
  const channels = v.srgb
  return keys(channels, ['r', 'g', 'b', 'a']) && ['r', 'g', 'b', 'a'].every((key) => number(channels[key], 0, 1))
}
const rect = (v: unknown): v is Rect => object(v) && keys(v, ['x', 'y', 'width', 'height'])
  && number(v.x, -8000, 8000) && number(v.y, -8000, 8000) && number(v.width, 0.01, 8000) && number(v.height, 0.01, 8000)

function paint(v: unknown): v is Paint {
  if (!object(v)) return false
  if (v.type === 'none') return keys(v, ['type'])
  if (v.type === 'solid') return keys(v, ['type', 'color']) && color(v.color)
  if (v.type === 'image') return keys(v, ['type', 'assetId', 'fit', 'crop', 'maskAssetId']) && assetId(v.assetId)
    && oneOf(v.fit, ['cover', 'contain', 'stretch']) && (v.crop === undefined || rect(v.crop))
    && (v.maskAssetId === undefined || assetId(v.maskAssetId))
  if (v.type !== 'gradient' || !keys(v, ['type', 'kind', 'angle', 'stops']) || !oneOf(v.kind, ['linear', 'radial'])
    || !number(v.angle, -360, 360) || !Array.isArray(v.stops) || v.stops.length < 2 || v.stops.length > 16) return false
  let last = -1
  return v.stops.every((stop) => {
    if (!object(stop) || !keys(stop, ['offset', 'color']) || !number(stop.offset, last, 1) || stop.offset < 0 || !color(stop.color)) return false
    last = stop.offset
    return true
  })
}

function textStyle(v: unknown): boolean {
  return object(v) && keys(v, ['fontFamily', 'fontStyle', 'fontSize', 'axes', 'fill', 'underline', 'letterSpacing', 'case'])
    && isFontName(v.fontFamily) && oneOf(v.fontStyle, ['Regular', 'Italic']) && number(v.fontSize, 8, 512)
    && object(v.axes) && keys(v.axes, ['wght']) && number(v.axes.wght, 100, 900) && paint(v.fill)
    && (v.underline === undefined || typeof v.underline === 'boolean')
    && (v.letterSpacing === undefined || number(v.letterSpacing, -10, 50)) && (v.case === undefined || oneOf(v.case, ['none', 'upper']))
}

const BASE_KEYS = ['id', 'name', 'type', 'transform', 'size', 'opacity', 'locked', 'hidden', 'decorative', 'effects', 'data']
function node(v: unknown, ids: Set<string>, depth: number, budget: { count: number; text: number }): boolean {
  if (!object(v) || depth > DESIGN_LIMITS.depth || ++budget.count > DESIGN_LIMITS.nodes || !uuid(v.id) || ids.has(v.id.toLowerCase())
    || !string(v.name, 120) || !object(v.transform) || !keys(v.transform, ['x', 'y', 'scaleX', 'scaleY', 'rotation'])
    || !number(v.transform.x, -8000, 8000) || !number(v.transform.y, -8000, 8000)
    || !number(v.transform.scaleX, 0.01, 100) || !number(v.transform.scaleY, 0.01, 100) || !number(v.transform.rotation, -360, 360)
    || !object(v.size) || !keys(v.size, ['width', 'height']) || !number(v.size.width, 0.01, 8000) || !number(v.size.height, 0.01, 8000)
    || !number(v.opacity, 0, 1) || ['locked', 'hidden', 'decorative'].some((key) => v[key] !== undefined && typeof v[key] !== 'boolean')) return false
  ids.add(v.id.toLowerCase())
  if (v.effects !== undefined && (!Array.isArray(v.effects) || v.effects.length > 8 || !v.effects.every((effect) => object(effect)
    && keys(effect, ['kind', 'dx', 'dy', 'blur', 'color', 'opacity']) && effect.kind === 'shadow'
    && number(effect.dx, -512, 512) && number(effect.dy, -512, 512) && number(effect.blur, 0, 512)
    && color(effect.color) && number(effect.opacity, 0, 1)))) return false
  if (v.data !== undefined) {
    if (!object(v.data) || !keys(v.data, ['carousely'])) return false
    const data = v.data.carousely
    if (data !== undefined && (!object(data) || !keys(data, ['field', 'hug', 'role'])
      || (data.field !== undefined && !isFieldConfig(data.field, String(v.type)))
      || (data.role !== undefined && !string(data.role, 40))
      || (data.hug !== undefined && (v.type !== 'shape' || !object(data.hug) || !keys(data.hug, ['textId']) || !uuid(data.hug.textId))))) return false
  }
  if (v.type === 'group') return keys(v, [...BASE_KEYS, 'children']) && Array.isArray(v.children)
    && v.children.every((child) => node(child, ids, depth + 1, budget))
  if (v.type === 'image') return keys(v, [...BASE_KEYS, 'fill']) && paint(v.fill) && v.fill.type === 'image'
  if (v.type === 'shape') return keys(v, [...BASE_KEYS, 'kind', 'cornerRadius', 'fill', 'stroke'])
    && oneOf(v.kind, ['rect', 'ellipse', 'triangle', 'line', 'arrow']) && number(v.cornerRadius, 0, 4000) && paint(v.fill)
    && (v.stroke === undefined || (object(v.stroke) && keys(v.stroke, ['color', 'width']) && color(v.stroke.color) && number(v.stroke.width, 0, 512)))
  if (v.type !== 'text' || !keys(v, [...BASE_KEYS, 'box', 'content']) || !object(v.box)
    || !keys(v.box, ['mode', 'width', 'height', 'autoFit', 'verticalAlign']) || !oneOf(v.box.mode, ['fixed', 'autoHeight', 'autoWidth'])
    || !number(v.box.width, 0.01, 8000) || !number(v.box.height, 0.01, 8000) || !oneOf(v.box.verticalAlign, ['top', 'middle', 'bottom'])
    || !object(v.box.autoFit) || !keys(v.box.autoFit, ['enabled', 'min', 'max']) || typeof v.box.autoFit.enabled !== 'boolean'
    || !number(v.box.autoFit.min, 8, 512) || !number(v.box.autoFit.max, v.box.autoFit.min, 512)
    || !Array.isArray(v.content) || v.content.length === 0 || v.content.length > 200) return false
  return v.content.every((paragraph) => object(paragraph) && keys(paragraph, ['runs', 'style'])
    && object(paragraph.style) && keys(paragraph.style, ['align', 'direction', 'lineHeight'])
    && oneOf(paragraph.style.align, ['left', 'center', 'right']) && oneOf(paragraph.style.direction, ['auto', 'ltr', 'rtl'])
    && number(paragraph.style.lineHeight, 0.5, 5) && Array.isArray(paragraph.runs) && paragraph.runs.length > 0 && paragraph.runs.length <= 200
    && paragraph.runs.every((run) => {
      if (!object(run) || !keys(run, ['text', 'style']) || !string(run.text, DESIGN_LIMITS.text) || !textStyle(run.style)) return false
      budget.text += run.text.length
      return budget.text <= DESIGN_LIMITS.pageText
    }))
}

export function walkNodes(nodes: readonly DesignNode[]): DesignNode[] {
  return nodes.flatMap((item) => item.type === 'group' ? [item, ...walkNodes(item.children)] : [item])
}

/** Strict saves: reject unsupported or corrupt data instead of silently removing someone's design. */
export function parseDesignDoc(value: unknown): { doc: DesignDoc } | { error: 'invalid' | 'version' } {
  if (!object(value) || value.format !== 'carousely.design') return { error: 'invalid' }
  if (value.schemaVersion !== 1) return { error: 'version' }
  const invalid = { error: 'invalid' } as const
  if (!keys(value, ['format', 'schemaVersion', 'id', 'title', 'unit', 'dpi', 'pages', 'assets', 'fonts', 'meta'])
    || !uuid(value.id) || !string(value.title, 200) || value.unit !== 'px' || value.dpi !== 96
    || !Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > DESIGN_LIMITS.pages) return invalid
  const ids = new Set<string>([value.id.toLowerCase()])
  for (const page of value.pages) {
    if (!object(page) || !keys(page, ['id', 'name', 'width', 'height', 'background', 'children', 'repeat'])
      || !uuid(page.id) || ids.has(page.id.toLowerCase()) || !string(page.name, 120)
      || !number(page.width, 100, 2000) || !number(page.height, 100, 2000) || !Number.isInteger(page.width) || !Number.isInteger(page.height)
      || !paint(page.background) || !Array.isArray(page.children)) return invalid
    ids.add(page.id.toLowerCase())
    const budget = { count: 0, text: 0 }
    if (!page.children.every((child) => node(child, ids, 0, budget))) return invalid
    if (page.repeat !== undefined && page.repeat !== null && (!object(page.repeat)
      || (page.repeat.mode === 'ai' ? !keys(page.repeat, ['mode']) : page.repeat.mode !== 'fixed'
        || !keys(page.repeat, ['mode', 'count']) || !number(page.repeat.count, 1, 10) || !Number.isInteger(page.repeat.count)))) return invalid
    const nodes = walkNodes(page.children as DesignNode[])
    for (const item of nodes) {
      const hug = item.data?.carousely?.hug
      if (hug && !nodes.some((target) => target.id === hug.textId && target.type === 'text')) return invalid
    }
  }
  if (!Array.isArray(value.assets) || value.assets.length > 2000 || !value.assets.every((item) => object(item)
    && keys(item, ['id', 'kind']) && assetId(item.id) && oneOf(item.kind, ['image', 'font']))) return invalid
  if (!Array.isArray(value.fonts) || value.fonts.length > 200 || !value.fonts.every((item) => object(item)
    && keys(item, ['family', 'assetId']) && isFontName(item.family) && (item.assetId === undefined || assetId(item.assetId)))) return invalid
  if (!object(value.meta) || !keys(value.meta, ['caption'])) return invalid
  const caption = value.meta.caption
  if (caption !== undefined && (!object(caption) || (caption.mode === 'static'
    ? !keys(caption, ['mode', 'value']) || typeof caption.value !== 'string' || inspectCaption(caption.value).errors.length > 0
    : caption.mode !== 'ai' || !keys(caption, ['mode', 'prompt']) || !string(caption.prompt, DESIGN_LIMITS.prompt)))) return invalid
  return { doc: value as unknown as DesignDoc }
}

export function designAssetIds(doc: DesignDoc): string[] {
  const ids = new Set(doc.assets.map((asset) => asset.id))
  const addPaint = (fill: Paint) => {
    if (fill.type !== 'image') return
    ids.add(fill.assetId)
    if (fill.maskAssetId) ids.add(fill.maskAssetId)
  }
  for (const font of doc.fonts) if (font.assetId) ids.add(font.assetId)
  for (const page of doc.pages) {
    addPaint(page.background)
    for (const item of walkNodes(page.children)) {
      if (item.type === 'image' || item.type === 'shape') addPaint(item.fill)
      if (item.type === 'text') for (const paragraph of item.content) for (const run of paragraph.runs) addPaint(run.style.fill)
    }
  }
  return [...ids]
}

export const hexColor = (hex: string): Color => ({ srgb: {
  r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255, a: 1,
} })

/** Identity is supplied by the caller so repeated reads never assign fresh node IDs. */
export function migrateLayerDoc(legacy: LayerDoc, identity: { id: string; pageId: string; nodeIds: string[] },
  baseAssetId: string, originalAssetId: string | null = null, title = ''): DesignDoc {
  const parsed = parseLayerDoc(legacy)
  if ('error' in parsed || identity.nodeIds.length !== legacy.layers.length + (originalAssetId ? 1 : 0)) throw new Error('invalid_legacy_design')
  const { doc } = parsed
  const children: DesignNode[] = doc.layers.map((layer, index) => {
    const base: BaseNode = { id: identity.nodeIds[index], name: layer.name ?? (layer.kind === 'text' ? layer.text.slice(0, 80) : layer.kind === 'shape' ? layer.shape : layer.role),
      transform: { x: layer.x, y: layer.y, scaleX: 1, scaleY: 1, rotation: layer.rotation ?? 0 }, size: { width: layer.w, height: layer.h }, opacity: layer.opacity ?? 1,
      ...(layer.locked !== undefined ? { locked: layer.locked } : {}), ...(layer.hidden !== undefined ? { hidden: layer.hidden } : {}),
      ...(layer.field ? { data: { carousely: { field: layer.field } } } : {}) }
    if (layer.kind === 'shape') return { ...base, type: 'shape', kind: layer.shape, cornerRadius: layer.radius,
      fill: { type: 'solid', color: hexColor(layer.color) }, stroke: { color: hexColor(layer.strokeColor), width: layer.strokeWidth } }
    if (layer.kind === 'image') return { ...base, type: 'image', fill: { type: 'image', assetId: layer.assetId, fit: 'stretch' },
      data: { carousely: { ...base.data?.carousely, role: layer.role } } }
    const style: TextStyle = { fontFamily: layer.font, fontStyle: layer.italic ? 'Italic' : 'Regular', fontSize: layer.size,
      axes: { wght: layer.weight }, fill: { type: 'solid', color: hexColor(layer.color) }, underline: layer.underline ?? false,
      letterSpacing: (layer.letterSpacing ?? 0) * 100, case: layer.uppercase ? 'upper' : 'none' }
    return { ...base, type: 'text', box: { mode: 'autoHeight', width: layer.w, height: layer.h,
      autoFit: { enabled: false, min: 12, max: 400 }, verticalAlign: 'top' },
    content: [{ runs: [{ text: layer.text, style }], style: { align: layer.align, direction: 'auto', lineHeight: layer.lineHeight } }],
    ...(layer.shadow ? { effects: [{ kind: 'shadow' as const, dx: 0, dy: layer.size * 0.04, blur: layer.size * 0.08,
      color: hexColor('#000000'), opacity: 0.45 }] } : {}) }
  })
  if (originalAssetId) children.unshift({ id: identity.nodeIds.at(-1)!, name: 'Gambar asli', type: 'image',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, size: { width: doc.width, height: doc.height },
    opacity: 1, hidden: true, locked: true, fill: { type: 'image', assetId: originalAssetId, fit: 'stretch' },
    data: { carousely: { role: 'original' } } })
  const design: DesignDoc = { format: 'carousely.design', schemaVersion: 1, id: identity.id, title, unit: 'px', dpi: 96,
    pages: [{ id: identity.pageId, name: 'Slide 1', width: doc.width, height: doc.height,
      background: { type: 'image', assetId: baseAssetId, fit: 'stretch' }, children }], assets: [],
    fonts: [...new Set(doc.layers.flatMap((layer) => layer.kind === 'text' ? [layer.font] : []))].map((family) => ({ family })), meta: {} }
  design.assets = designAssetIds(design).map((id) => ({ id, kind: 'image' }))
  if ('error' in parseDesignDoc(design)) throw new Error('invalid_migrated_design')
  return design
}
