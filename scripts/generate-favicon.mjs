import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// Run from the project root: node scripts/generate-favicon.mjs
const source = 'public/brand/carousely-mark.webp'
const sizes = [16, 32, 48]
const render = (size) => sharp(source).resize(size, size).flatten({ background: '#ffffff' }).png().toBuffer()
// BMP/DIB entries also work with Turbopack's ICO decoder (PNG-compressed ICO entries do not).
const images = await Promise.all(sizes.map(async (size) => {
  const rgba = await sharp(source).resize(size, size).flatten({ background: '#ffffff' }).ensureAlpha().raw().toBuffer()
  const maskStride = Math.ceil(size / 32) * 4
  const dib = Buffer.alloc(40 + size * size * 4 + maskStride * size)
  dib.writeUInt32LE(40, 0)
  dib.writeInt32LE(size, 4)
  dib.writeInt32LE(size * 2, 8)
  dib.writeUInt16LE(1, 12)
  dib.writeUInt16LE(32, 14)
  dib.writeUInt32LE(size * size * 4, 20)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const from = (y * size + x) * 4
    const to = 40 + ((size - y - 1) * size + x) * 4
    dib[to] = rgba[from + 2]
    dib[to + 1] = rgba[from + 1]
    dib[to + 2] = rgba[from]
    dib[to + 3] = rgba[from + 3]
  }
  return dib
}))
const header = Buffer.alloc(6 + sizes.length * 16)
header.writeUInt16LE(1, 2) // ICO image type.
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
images.forEach((image, index) => {
  const entry = 6 + index * 16
  header[entry] = sizes[index]
  header[entry + 1] = sizes[index]
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(image.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += image.length
})
await writeFile('src/app/favicon.ico', Buffer.concat([header, ...images]))
await writeFile('src/app/icon.png', await render(192))
console.log('Generated Carousely favicon (16, 32, 48 px) and app icon (192 px).')
