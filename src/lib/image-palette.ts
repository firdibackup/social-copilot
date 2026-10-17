import 'server-only'
import sharp from 'sharp'
import { extractPalette } from './palette'

/** Same sample size as the browser's paletteOf: plenty for a palette. */
const SAMPLE_EDGE = 96

/** The palette of an image on the server, for references the browser never sees (the new-account fill). */
export async function paletteFromBytes(bytes: Uint8Array): Promise<string[]> {
  const { data } = await sharp(bytes)
    .resize(SAMPLE_EDGE, SAMPLE_EDGE, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return extractPalette(data)
}
