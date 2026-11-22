import {
  fillFrame, frameAt, frameCrop, newFrameLayer,
  type ClosedShapeKind, type FrameLayer, type ImageLayer, type Layer, type LayerDoc,
} from '@/lib/layer-doc'

/**
 * Bingkai presets: a closed shape and the box it starts in (`aspect` = width / height; `radius` a fraction of the
 * shorter side, rects only). Several crops of one shape (square, portrait, landscape…) are separate presets.
 */
export const FRAME_PRESETS = [
  { id: 'square', shape: 'rect', aspect: 1 },
  { id: 'rounded', shape: 'rect', aspect: 1, radius: 0.12 },
  { id: 'portrait', shape: 'rect', aspect: 4 / 5 },
  { id: 'landscape', shape: 'rect', aspect: 3 / 2 },
  { id: 'story', shape: 'rect', aspect: 9 / 16 },
  { id: 'wide', shape: 'rect', aspect: 16 / 9 },
  { id: 'circle', shape: 'ellipse', aspect: 1 },
  { id: 'oval', shape: 'ellipse', aspect: 3 / 4 },
  { id: 'arch', shape: 'arch', aspect: 3 / 4 },
  { id: 'archTall', shape: 'arch', aspect: 9 / 16 },
  { id: 'pill', shape: 'pill', aspect: 2 },
  { id: 'pillTall', shape: 'pill', aspect: 1 / 2 },
  { id: 'squircle', shape: 'squircle', aspect: 1 },
  { id: 'blob', shape: 'blob', aspect: 1 },
  { id: 'flower', shape: 'flower', aspect: 1 },
  { id: 'heart', shape: 'heart', aspect: 1 },
  { id: 'star', shape: 'star', aspect: 1 },
  { id: 'star4', shape: 'star4', aspect: 1 },
  { id: 'burst', shape: 'burst', aspect: 1 },
  { id: 'hexagon', shape: 'hexagon', aspect: 1 },
  { id: 'octagon', shape: 'octagon', aspect: 1 },
  { id: 'pentagon', shape: 'pentagon', aspect: 1 },
  { id: 'triangle', shape: 'triangle', aspect: 1 },
  { id: 'diamond', shape: 'diamond', aspect: 1 },
  { id: 'cloud', shape: 'cloud', aspect: 4 / 3 },
  { id: 'speechBubble', shape: 'speechBubble', aspect: 1 },
  { id: 'shield', shape: 'shield', aspect: 4 / 5 },
  { id: 'teardrop', shape: 'teardrop', aspect: 3 / 4 },
  { id: 'halfCircle', shape: 'halfCircle', aspect: 2 },
  { id: 'quarterCircle', shape: 'quarterCircle', aspect: 1 },
  { id: 'parallelogram', shape: 'parallelogram', aspect: 3 / 2 },
  { id: 'trapezoid', shape: 'trapezoid', aspect: 3 / 2 },
  { id: 'moon', shape: 'moon', aspect: 5 / 6 },
  { id: 'cross', shape: 'cross', aspect: 1 },
  { id: 'chevron', shape: 'chevron', aspect: 4 / 3 },
  { id: 'ribbon', shape: 'ribbon', aspect: 2 },
] as const satisfies readonly { id: string; shape: ClosedShapeKind; aspect: number; radius?: number }[]

export type FramePreset = (typeof FRAME_PRESETS)[number]
export type FramePresetId = FramePreset['id']

export const newFrameFromPreset = (doc: LayerDoc, preset: FramePreset) =>
  newFrameLayer(doc, preset.shape, preset.aspect, 'radius' in preset ? preset.radius : 0)

/**
 * A filled frame as the image layer the crop tools work on: same box and rotation, and the crop the frame shows
 * (its stored crop fitted to the frame's aspect, or the centred cover). The crop then has the box's aspect, so the
 * crop math's "stretched into the box" is the frame's cover, never squashed.
 */
export function frameAsImage(frame: FrameLayer & { assetId: string }, width: number, height: number): ImageLayer {
  const crop = frameCrop(frame, width, height)
  return {
    id: frame.id, kind: 'image', assetId: frame.assetId, role: 'upload', x: frame.x, y: frame.y, w: frame.w, h: frame.h,
    ...(frame.rotation !== undefined ? { rotation: frame.rotation } : {}), ...(frame.opacity !== undefined ? { opacity: frame.opacity } : {}),
    crop,
  }
}

/** The frame with the crop of a crop session's draft (`frameAsImage` of it, panned and zoomed); the frame stays put. */
export function frameWithCrop(frame: FrameLayer, draft: ImageLayer): FrameLayer {
  const next: FrameLayer = { ...frame }
  delete next.crop
  if (!next.assetId) return next
  return draft.crop ? { ...next, crop: { ...draft.crop } } : next
}

/**
 * A picture layer let go over a frame (Canva's drag-into-frame): the frame takes the picture and the layer goes.
 * Null when `image` isn't over an unlocked, visible frame (its centre decides) or isn't an image layer.
 */
export function dropLayerIntoFrame(doc: LayerDoc, image: Layer, point?: { x: number; y: number }): LayerDoc | null {
  if (image.kind !== 'image') return null
  const at = point ?? { x: image.x + image.w / 2, y: image.y + image.h / 2 }
  const frame = frameAt(doc.layers.filter((layer) => layer.id !== image.id), at.x, at.y)
  if (!frame) return null
  return { ...doc, layers: doc.layers.filter((layer) => layer.id !== image.id).map((layer) => (layer.id === frame.id ? fillFrame(frame, image.assetId) : layer)) }
}

/** Whether an image file (or a picture of any kind the browser can decode) is in a drag or a paste. */
export const isImageFile = (file: File) => file.type.startsWith('image/')

/** The first image file of a DataTransfer (a drop or a paste), or null. */
export function imageFileOf(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const file of Array.from(data.files)) if (isImageFile(file)) return file
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) return file
  }
  return null
}

/**
 * Whether a drag may carry a picture, so the canvas should accept it: files from the device, or an image dragged out
 * of another tab (which brings only its HTML and address).
 */
export const dragHasImage = (data: DataTransfer | null) =>
  Boolean(data && Array.from(data.types).some((type) => type === 'Files' || type === 'text/uri-list' || type === 'text/html'))

/** A picture from a paste or a drop: a file the browser can read, or the address of one on the web. */
export type ClipImage = { file: File } | { url: string }

const IMG_SRC = /<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'", '#x27': "'", '#x2F': '/', '#47': '/' }
const decodeEntities = (text: string) => text.replace(/&(amp|quot|apos|lt|gt|#39|#x27|#x2F|#47);/gi, (all, name: string) =>
  ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? all)
const httpUrl = (text: string) => (/^https?:\/\/[^\s]+$/i.test(text) ? text : null)

/** A `data:image/…` address as a file (pages often show small pictures inline like this), or null. */
export function dataUrlFile(url: string): File | null {
  const match = /^data:(image\/[\w.+-]+)((?:;[^,]*)?),([\s\S]*)$/i.exec(url.trim())
  if (!match) return null
  try {
    const raw = /;base64/i.test(match[2]) ? atob(match[3].replace(/\s/g, '')) : decodeURIComponent(match[3])
    const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0))
    return bytes.length ? new File([bytes], 'pasted-image', { type: match[1].toLowerCase() }) : null
  } catch {
    return null
  }
}

/**
 * The picture a paste or a drop carries. A real image file first (a screenshot, "Copy image"); else the picture in
 * its HTML (copying or dragging an image out of a page such as Google brings only `<img src>`); else an image address
 * ("Copy image address"). `data:` pictures come back as files, web addresses as `url` for the server to fetch.
 */
export function clipImageOf(data: DataTransfer | null): ClipImage | null {
  const file = imageFileOf(data)
  if (file) return { file }
  if (!data) return null
  const read = (type: string) => { try { return data.getData(type) ?? '' } catch { return '' } }
  const match = IMG_SRC.exec(read('text/html'))
  const src = match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim() : ''
  if (/^data:image\//i.test(src)) {
    const inline = dataUrlFile(src)
    if (inline) return { file: inline }
  }
  const address = httpUrl(src)
    ?? httpUrl(read('text/uri-list').split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#'))?.trim() ?? '')
    ?? httpUrl(read('text/plain').trim())
  if (address) return { url: address }
  const inline = dataUrlFile(read('text/plain'))
  return inline ? { file: inline } : null
}
