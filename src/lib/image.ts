/** Meta's feed limits: JPEG only, at most 8 MB, aspect ratio 4:5 to 1.91:1, at most 1440 px wide. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_WIDTH = 1440
const JPEG_QUALITY = 0.9

export interface Fit {
  /** Source crop rectangle. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Output size. */
  width: number
  height: number
}

/** Centre-crops into the 4:5–1.91:1 range and caps the width. Integer math keeps the ratio inside the range. */
export function fitToInstagram(width: number, height: number): Fit {
  const sw = Math.min(width, Math.floor((height * 191) / 100))
  const sh = Math.min(height, Math.floor((width * 5) / 4))
  const outWidth = Math.min(sw, MAX_WIDTH)
  return {
    sx: Math.floor((width - sw) / 2),
    sy: Math.floor((height - sh) / 2),
    sw,
    sh,
    width: outWidth,
    height: Math.round((sh * outWidth) / sw),
  }
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
}

/** Browser only: decodes any image the browser can read and re-encodes it as an Instagram-ready JPEG. */
export async function toInstagramJpeg(file: File): Promise<PreparedImage> {
  // createImageBitmap applies the EXIF orientation, so phone photos come out upright.
  const bitmap = await createImageBitmap(file)
  const fit = fitToInstagram(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = fit.width
  canvas.height = fit.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas tidak tersedia di browser ini')
  // JPEG has no transparency; without a fill, transparent PNG areas turn black.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, fit.width, fit.height)
  context.drawImage(bitmap, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, fit.width, fit.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('Foto gagal dikonversi ke JPEG')
  return { blob, width: fit.width, height: fit.height }
}
