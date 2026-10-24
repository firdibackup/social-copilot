import { describe, expect, it } from 'vitest'
import { contentBox, detectGrid, gridCells, toGray, type Gray } from './grid-split'

/** A picture built from cells: each cell a gradient with a block, so it is busy inside like a real design. */
function picture({
  cols,
  rows,
  cell = { width: 80, height: 100 },
  gutter = 0,
  margin = 0,
  frame = 255,
}: {
  cols: number
  rows: number
  cell?: { width: number; height: number }
  gutter?: number
  margin?: number
  frame?: number
}): Gray {
  const width = margin * 2 + cols * cell.width + (cols - 1) * gutter
  const height = margin * 2 + rows * cell.height + (rows - 1) * gutter
  const data = new Uint8Array(width * height).fill(frame)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = margin + c * (cell.width + gutter)
      const top = margin + r * (cell.height + gutter)
      const base = 40 + ((r * cols + c) * 53) % 160
      for (let y = 0; y < cell.height; y++) {
        for (let x = 0; x < cell.width; x++) {
          const block = x > cell.width / 4 && x < (cell.width * 3) / 4 && y > cell.height / 3 && y < (cell.height * 2) / 3
          data[(top + y) * width + left + x] = block ? 255 - base : Math.min(255, base + ((x * 3 + y * 5) % 40))
        }
      }
    }
  }
  return { data, width, height }
}

describe('detectGrid', () => {
  it('finds designs that touch without gutters', () => {
    expect(detectGrid(picture({ cols: 4, rows: 2 }))).toEqual({ cols: 4, rows: 2 })
  })

  it('finds designs between white gutters inside a white frame', () => {
    expect(detectGrid(picture({ cols: 3, rows: 2, gutter: 6, margin: 12 }))).toEqual({ cols: 3, rows: 2 })
  })

  it('reads a square profile grid', () => {
    expect(detectGrid(picture({ cols: 3, rows: 3, cell: { width: 90, height: 90 }, gutter: 2 }))).toEqual({ cols: 3, rows: 3 })
  })

  it('leaves one design whole', () => {
    expect(detectGrid(picture({ cols: 1, rows: 1, cell: { width: 160, height: 200 } }))).toEqual({ cols: 1, rows: 1 })
  })
})

describe('gridCells', () => {
  it('cuts each cell clear of the frame and gutters', () => {
    const image = picture({ cols: 3, rows: 2, gutter: 6, margin: 12 })
    const cells = gridCells(image, { cols: 3, rows: 2 })
    expect(cells).toHaveLength(6)
    expect(cells[0]).toEqual({ x: 12, y: 12, width: 80, height: 100 })
    expect(cells[1]).toEqual({ x: 98, y: 12, width: 80, height: 100 })
    expect(cells[5]).toEqual({ x: 184, y: 118, width: 80, height: 100 })
  })

  it('splits evenly where a hand-set grid has no seam', () => {
    const image = picture({ cols: 1, rows: 1, cell: { width: 160, height: 200 } })
    expect(gridCells(image, { cols: 2, rows: 1 })).toEqual([
      { x: 0, y: 0, width: 80, height: 200 },
      { x: 80, y: 0, width: 80, height: 200 },
    ])
  })

  it('keeps 1×1 uncropped', () => {
    const image = picture({ cols: 1, rows: 1, margin: 10 })
    expect(gridCells(image, { cols: 1, rows: 1 })).toEqual([{ x: 0, y: 0, width: image.width, height: image.height }])
  })
})

describe('contentBox', () => {
  it('keeps a plain band on one side only: that is the design, not a frame', () => {
    const image = picture({ cols: 1, rows: 1 })
    for (let x = 0; x < image.width; x++) for (let y = 0; y < 20; y++) (image.data as Uint8Array)[y * image.width + x] = 255
    expect(contentBox(image)).toEqual({ x: 0, y: 0, width: image.width, height: image.height })
  })
})

describe('toGray', () => {
  it('weighs the channels by luminance', () => {
    expect(Array.from(toGray([255, 0, 0, 255, 0, 255, 0, 255, 255, 255, 255, 255], 3, 1).data)).toEqual([76, 150, 255])
  })
})
