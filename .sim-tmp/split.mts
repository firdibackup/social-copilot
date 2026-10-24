import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import sharp from 'sharp'
import { buildTemplateMessages } from '/Users/mm/Documents/social-copilot/src/lib/template-ai'
import { chatCompletion } from '/Users/mm/Documents/social-copilot/src/lib/nine-router'

const OUT = '/Users/mm/Documents/social-copilot/simulasi-carousel/potongan'
mkdirSync(OUT, { recursive: true })
const source = readFileSync(new URL('./grid.jpg', import.meta.url))

// Edge strength along every column and row: tiles that touch without gutters still leave a sharp seam.
const { data, info } = await sharp(source).greyscale().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info
const px = (x: number, y: number) => data[y * W + x]
const colEdge = Array.from({ length: W }, (_, x) => {
  if (x === 0) return 0
  let sum = 0
  for (let y = 0; y < H; y++) sum += Math.abs(px(x, y) - px(x - 1, y))
  return sum / H
})
const rowEdge = Array.from({ length: H }, (_, y) => {
  if (y === 0) return 0
  let sum = 0
  for (let x = 0; x < W; x++) sum += Math.abs(px(x, y) - px(x, y - 1))
  return sum / W
})
const near = (edges: number[], at: number) => Math.max(...edges.slice(Math.max(1, at - 2), at + 3))
const mean = (edges: number[]) => edges.reduce((a, b) => a + b, 0) / edges.length

// Try every grid of 1–6 columns and 1–4 rows whose tiles are about 4:5 or 1:1; the one whose cut lines sit on the
// strongest seams wins.
let best = { cols: 1, rows: 1, score: 0 }
for (let cols = 1; cols <= 6; cols++) {
  for (let rows = 1; rows <= 4; rows++) {
    if (cols * rows < 2) continue
    const aspect = W / cols / (H / rows)
    if (Math.abs(aspect - 0.8) > 0.06 && Math.abs(aspect - 1) > 0.06) continue
    const cuts = [
      ...Array.from({ length: cols - 1 }, (_, i) => near(colEdge, Math.round(((i + 1) * W) / cols)) / mean(colEdge)),
      ...Array.from({ length: rows - 1 }, (_, i) => near(rowEdge, Math.round(((i + 1) * H) / rows)) / mean(rowEdge)),
    ]
    const score = Math.min(...cuts)
    console.log(`${cols}x${rows} aspect ${aspect.toFixed(2)} seam ${score.toFixed(1)}`)
    // A coarser grid's cuts are a subset of a finer one's; take the most tiles whose every cut is a real seam.
    if (score >= 3 && cols * rows > best.cols * best.rows) best = { cols, rows, score }
  }
}
console.log('dipilih:', best)

const tiles: { id: string; dataUrl: string }[] = []
const tw = Math.floor(W / best.cols)
const th = Math.floor(H / best.rows)
for (let r = 0; r < best.rows; r++) {
  for (let c = 0; c < best.cols; c++) {
    const jpeg = await sharp(source).extract({ left: c * tw, top: r * th, width: tw, height: th }).jpeg({ quality: 90 }).toBuffer()
    const id = `tile-${r * best.cols + c + 1}`
    writeFileSync(`${OUT}/${id}.jpg`, jpeg)
    tiles.push({ id, dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` })
  }
}

const answer = await chatCompletion(buildTemplateMessages(tiles))
writeFileSync(`${OUT}/analisis.json`, answer)
console.log(answer)
