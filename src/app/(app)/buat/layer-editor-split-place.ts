/**
 * Where "Pisahkan objek" puts its result in the doc: the cut-out subject as a new image layer, the source swapped for
 * its cleaned copy. Pure, so it is tested on its own.
 */
import { clampBox, LAYER_LIMITS, newLayerId, type ImageCrop, type ImageLayer, type LayerDoc } from '@/lib/layer-doc'
import { cropOf } from './layer-editor-gesture'

export interface SplitResult {
  object: { assetId: string; width: number; height: number; box: { x: number; y: number; w: number; h: number } }
  cleaned: { assetId: string; width: number; height: number }
}

const CROP_MIN = LAYER_LIMITS.crop.min
/** Canvas px to a hundredth, so float noise doesn't reach the stored doc. */
const px = (value: number) => Math.round(value * 100) / 100
/** A crop rounded the same way, still inside the source. */
function fraction(crop: ImageCrop): ImageCrop {
  const round = (value: number) => Math.round(value * 1e6) / 1e6
  const x = Math.min(1 - CROP_MIN, Math.max(0, round(crop.x)))
  const y = Math.min(1 - CROP_MIN, Math.max(0, round(crop.y)))
  return { x, y, w: Math.min(1 - x, Math.max(CROP_MIN, round(crop.w))), h: Math.min(1 - y, Math.max(CROP_MIN, round(crop.h))) }
}

/**
 * The slide's background was split: the object sits at its own box (source px are canvas px), just above the
 * background and under every other layer, so text stays on top. Null when the doc is full.
 */
export function placeBackgroundSplit(doc: LayerDoc, result: SplitResult): { doc: LayerDoc; layer: ImageLayer } | null {
  if (doc.layers.length >= LAYER_LIMITS.layers) return null
  const { box, assetId } = result.object
  const layer: ImageLayer = { id: newLayerId(doc), kind: 'image', assetId, role: 'object', x: box.x, y: box.y, w: box.w, h: box.h }
  return { doc: { ...doc, layers: [layer, ...doc.layers] }, layer }
}

/**
 * An image layer was split: it shows the cleaned image (crop, size and rotation kept) and the object goes directly
 * above it, on the same spot of the picture. The object is mapped through the layer's crop and any stretch; where it
 * reaches past the visible crop it is cropped the same way, so nothing appears outside the frame. An object wholly
 * outside the crop is placed whole, kept on the canvas. Null when the doc is full or the layer is gone.
 */
export function placeLayerSplit(doc: LayerDoc, layerId: string, result: SplitResult): { doc: LayerDoc; layer: ImageLayer } | null {
  if (doc.layers.length >= LAYER_LIMITS.layers) return null
  const index = doc.layers.findIndex((item) => item.id === layerId)
  const source = doc.layers[index]
  if (!source || source.kind !== 'image') return null
  const { width, height } = result.cleaned
  const { box } = result.object
  // The object in fractions of the source image.
  const object = { x: box.x / width, y: box.y / height, w: box.w / width, h: box.h / height }
  const crop = cropOf(source)
  const ix = Math.max(object.x, crop.x)
  const iy = Math.max(object.y, crop.y)
  const iw = Math.min(object.x + object.w, crop.x + crop.w) - ix
  const ih = Math.min(object.y + object.h, crop.y + crop.h) - iy
  const visible = iw >= object.w * CROP_MIN && ih >= object.h * CROP_MIN
  const shown = visible ? { x: ix, y: iy, w: iw, h: ih } : object
  // Source fraction → the layer's own frame (unrotated, canvas px).
  const frame = {
    x: source.x + (shown.x - crop.x) / crop.w * source.w,
    y: source.y + (shown.y - crop.y) / crop.h * source.h,
    w: shown.w / crop.w * source.w,
    h: shown.h / crop.h * source.h,
  }
  // The layer turns about its centre: turn the object's centre the same way, then give it the same rotation.
  const angle = (source.rotation ?? 0) * Math.PI / 180
  const ox = frame.x + frame.w / 2 - (source.x + source.w / 2)
  const oy = frame.y + frame.h / 2 - (source.y + source.h / 2)
  const cx = source.x + source.w / 2 + ox * Math.cos(angle) - oy * Math.sin(angle)
  const cy = source.y + source.h / 2 + ox * Math.sin(angle) + oy * Math.cos(angle)
  const objectCrop: ImageCrop | null = visible && (iw < object.w - 1e-6 || ih < object.h - 1e-6)
    ? fraction({ x: (ix - object.x) / object.w, y: (iy - object.y) / object.h, w: iw / object.w, h: ih / object.h })
    : null
  let layer: ImageLayer = {
    id: newLayerId(doc), kind: 'image', assetId: result.object.assetId, role: 'object',
    x: px(cx - frame.w / 2), y: px(cy - frame.h / 2), w: px(Math.max(1, frame.w)), h: px(Math.max(1, frame.h)),
    ...(source.rotation ? { rotation: source.rotation } : {}),
    ...(source.opacity !== undefined ? { opacity: source.opacity } : {}),
    ...(objectCrop ? { crop: objectCrop } : {}),
  }
  if (!visible) layer = clampBox(layer, doc)
  const layers = doc.layers.map((item) => (item.id === layerId ? { ...source, assetId: result.cleaned.assetId } : item))
  layers.splice(index + 1, 0, layer)
  return { doc: { ...doc, layers }, layer }
}
