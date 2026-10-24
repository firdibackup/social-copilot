/** Browser only: reads a grid picture and cuts its designs out as reference JPEGs (see grid-split.ts). */
import { detectGrid, gridCells, toGray, type Gray, type GridSize, type Rect } from './grid-split'
import type { PreparedReference } from './image'
import { paletteOf } from './palette'

/** Detection runs on a copy this many pixels on the long edge: seams survive, and it stays fast. */
const DETECT_EDGE = 1200
const TILE_MAX_EDGE = 1080
const TILE_QUALITY = 0.9

export interface GridSource {
  /** The decoded picture at full size; close() it when done. */
  bitmap: ImageBitmap
  width: number
  height: number
  /** The grid the seams suggest; 1×1 when none was found. */
  detected: GridSize
  /** The shrunk greyscale copy the seams are read from. */
  gray: Gray
  /** gray's size over the picture's. */
  scale: number
}

export async function loadGrid(file: Blob): Promise<GridSource> {
  // createImageBitmap applies the EXIF orientation, so phone screenshots come out upright.
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, DETECT_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error('Canvas tidak tersedia di browser ini')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const gray = toGray(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
  return { bitmap, width: bitmap.width, height: bitmap.height, detected: detectGrid(gray), gray, scale }
}

/** Each cell of `grid`, row by row, in the full picture's pixels. */
export function cellsOf(source: GridSource, grid: GridSize): Rect[] {
  const up = (value: number) => Math.round(value / source.scale)
  return gridCells(source.gray, grid).map((cell) => {
    const x = Math.min(source.width - 1, up(cell.x))
    const y = Math.min(source.height - 1, up(cell.y))
    return {
      x,
      y,
      width: Math.max(1, Math.min(source.width - x, up(cell.x + cell.width) - x)),
      height: Math.max(1, Math.min(source.height - y, up(cell.y + cell.height) - y)),
    }
  })
}

/** One cell as a reference JPEG, at most 1080 px on the long edge, with its palette (as toReferenceJpeg). */
export async function cropTile(source: GridSource, rect: Rect): Promise<PreparedReference> {
  const scale = Math.min(1, TILE_MAX_EDGE / Math.max(rect.width, rect.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.width * scale))
  canvas.height = Math.max(1, Math.round(rect.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas tidak tersedia di browser ini')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source.bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
  const tile = await createImageBitmap(canvas)
  const palette = paletteOf(tile)
  tile.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', TILE_QUALITY))
  if (!blob) throw new Error('Potongan gagal dikonversi ke JPEG')
  return { blob, palette }
}
