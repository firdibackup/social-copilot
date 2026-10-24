import sharp from 'sharp'
import { detectGrid, gridCells } from '../src/lib/grid-split'

for (const file of process.argv.slice(2)) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true })
  const image = { data, width: info.width, height: info.height }
  const grid = detectGrid(image)
  console.log(file, info.width, info.height, grid, gridCells(image, grid).map(c=>`${c.x},${c.y} ${c.width}x${c.height}`).join(" | "))
}
