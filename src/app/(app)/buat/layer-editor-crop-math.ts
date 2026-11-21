import type { Handle, ImageLayer } from '@/lib/layer-doc'
import { cropOf, resizeRotatedLayer } from './layer-editor-gesture'

/**
 * Crop mode: a frame handle dragged by (dx, dy) canvas px. A side moves that edge over the picture (the image stays
 * put); a corner does both of its sides. Rotation is taken into account.
 */
export function cropHandle<T extends ImageLayer>(start: T, handle: Handle, dx: number, dy: number): T {
  if (handle.length === 1) return resizeRotatedLayer(start, handle, dx, dy) as T
  const horizontal = resizeRotatedLayer(start, handle[1] as Handle, dx, dy) as T
  return resizeRotatedLayer(horizontal, handle[0] as Handle, dx, dy) as T
}

/**
 * How far the picture is zoomed inside the frame: 1 when it just covers it (the most zoomed out crop mode allows),
 * more as it zooms in.
 */
export const cropZoom = (layer: Pick<ImageLayer, 'crop'>) => {
  const crop = cropOf(layer)
  return 1 / Math.max(crop.w, crop.h)
}
