import 'server-only'
import sharp from 'sharp'
import { IMAGE_FORMATS, type ImageFormat } from './image-options'
import { logoBox, type LogoPlacement } from './logo-options'

/** Below this brightness (0–1) the place under the logo counts as dark. */
const DARK_AREA = 0.42
/** A logo at least this bright already shows on a dark area and stays as it is. */
const LIGHT_LOGO = 0.6
/** Only a logo with at least this share of see-through pixels is a cut-out mark; a full picture is never recoloured. */
const CUT_OUT_SHARE = 0.05
const OPAQUE = 128

const brightness = (red: number, green: number, blue: number) => (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255

/**
 * The image at the format's exact size with the brand logo stamped at its place: the same pixels on every slide,
 * never redrawn by the image model. A cut-out logo that would disappear on a dark area is stamped in white.
 * Returns a PNG, so the slide is compressed only once, afterwards.
 */
export async function stampLogo(image: Uint8Array, format: ImageFormat, logo: Uint8Array, placement: LogoPlacement): Promise<Uint8Array> {
  const { width, height } = IMAGE_FORMATS[format]
  const base = sharp(image).rotate().resize(width, height, { fit: 'cover' }).flatten({ background: '#ffffff' })

  let mark = sharp(logo).rotate().ensureAlpha()
  // Measured on the logo as uploaded: a full picture (a photo, a profile picture) has no see-through part.
  const alpha = await mark.clone().extractChannel('alpha').raw().toBuffer()
  const cutOut = alpha.reduce((count, value) => count + (value < OPAQUE ? 1 : 0), 0) / alpha.length >= CUT_OUT_SHARE
  // Empty space around a cut-out mark would make it look smaller than the size the owner picked. A full picture
  // keeps its edges: its background is part of the logo.
  const trimmed = cutOut ? await mark.clone().trim().toBuffer().catch(() => null) : null
  if (trimmed) mark = sharp(trimmed).ensureAlpha()
  const size = await mark.metadata()
  const box = logoBox({ width, height }, { width: size.width, height: size.height }, placement)
  const { data, info } = await mark.resize(box.width, box.height, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })

  let solid = 0
  let light = 0
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < OPAQUE) continue
    solid += 1
    light += brightness(data[offset], data[offset + 1], data[offset + 2])
  }
  if (cutOut && solid > 0 && light / solid < LIGHT_LOGO) {
    // The pixels the logo will cover, read from the resized slide (sharp's stats() would read the input instead).
    const under = await base.clone().extract(box).removeAlpha().raw().toBuffer()
    let dark = 0
    for (let offset = 0; offset < under.length; offset += 3) dark += brightness(under[offset], under[offset + 1], under[offset + 2])
    if (dark / (under.length / 3) < DARK_AREA) {
      for (let offset = 0; offset < data.length; offset += 4) data[offset] = data[offset + 1] = data[offset + 2] = 255
    }
  }

  const stamp = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
  return new Uint8Array(await base.composite([{ input: stamp, left: box.left, top: box.top }]).png({ compressionLevel: 1 }).toBuffer())
}
