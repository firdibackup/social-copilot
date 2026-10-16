import { PALETTE_SIZE } from './brand-options'

/** Images are shrunk to this many pixels on the long edge before counting: plenty for a palette. */
const SAMPLE_EDGE = 96
/** RGB distance under which two colours count as the same swatch. */
const MIN_DISTANCE = 48
const OPAQUE = 128

type Rgb = [number, number, number]

const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const toHex = (rgb: Rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`

/**
 * The most common distinct colours of RGBA pixels (ImageData.data), most common first. Pixels are grouped by
 * their top 4 bits per channel; each group's average is a candidate, and candidates close to one already taken
 * are skipped so a photo of one red wall doesn't return five reds.
 */
export function extractPalette(pixels: ArrayLike<number>, count = PALETTE_SIZE): string[] {
  const groups = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < OPAQUE) continue
    const [r, g, b] = [pixels[index], pixels[index + 1], pixels[index + 2]]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const group = groups.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    group.n += 1
    group.r += r
    group.g += g
    group.b += b
    groups.set(key, group)
  }

  const candidates = [...groups.values()]
    .sort((a, b) => b.n - a.n)
    .map((group): Rgb => [group.r, group.g, group.b].map((sum) => Math.round(sum / group.n)) as Rgb)
  const chosen: Rgb[] = []
  for (const colour of candidates) {
    if (chosen.length === count) break
    if (chosen.every((taken) => distance(taken, colour) >= MIN_DISTANCE)) chosen.push(colour)
  }
  return chosen.map(toHex)
}

/** Browser only: the palette of a decoded image. */
export function paletteOf(image: ImageBitmap): string[] {
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return []
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return extractPalette(context.getImageData(0, 0, canvas.width, canvas.height).data)
}

/** Browser only. Signed Storage URLs work because Supabase answers with CORS headers. */
export async function paletteFromBlob(blob: Blob): Promise<string[]> {
  const bitmap = await createImageBitmap(blob)
  try {
    return paletteOf(bitmap)
  } finally {
    bitmap.close()
  }
}
