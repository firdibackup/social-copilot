/**
 * Splits a picture of several designs laid out in a grid (a profile screenshot, a moodboard) into one rectangle per
 * design. Pure: works on greyscale pixels, so it runs in the browser and in tests alike.
 */

export interface Gray {
  /** One 0–255 value per pixel, row by row. */
  data: ArrayLike<number>
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface GridSize {
  cols: number
  rows: number
}

export const MAX_GRID_COLS = 6
export const MAX_GRID_ROWS = 5

/** Instagram tiles run from 3:4 (the new profile grid) to 1:1; a little either side for screenshots' rounding. */
const MIN_ASPECT = 0.7
const MAX_ASPECT = 1.1
/** A real cut is this many times sharper than an average line of the picture, or a flat gutter. */
const MIN_SEAM = 3
/** A line counts as flat (margin, gutter) when its pixels vary less than this. */
const FLAT_STD = 6
/** Two flat bands are the same frame when their mean grey differs by less than this. */
const SAME_GREY = 16
/** A margin is at most this share of the picture's side; a gutter at most this share of a cell's. */
const MAX_MARGIN = 0.15
const MAX_GUTTER = 0.08

type Axis = 'col' | 'row'

const at = (image: Gray, x: number, y: number) => image.data[y * image.width + x]

/** Mean and spread of one column (or row) between `from` and `to` on the other axis. */
function line(image: Gray, axis: Axis, index: number, from: number, to: number) {
  let sum = 0
  let squares = 0
  for (let i = from; i < to; i++) {
    const value = axis === 'col' ? at(image, index, i) : at(image, i, index)
    sum += value
    squares += value * value
  }
  const n = Math.max(1, to - from)
  const mean = sum / n
  return { mean, flat: Math.sqrt(Math.max(0, squares / n - mean * mean)) < FLAT_STD }
}

const lineIn = (image: Gray, axis: Axis, index: number, box: Rect) =>
  axis === 'col' ? line(image, 'col', index, box.y, box.y + box.height) : line(image, 'row', index, box.x, box.x + box.width)

/** How many flat lines of one grey run inward from `start` (stepping by `dir`), at most `max`. */
function flatRun(image: Gray, axis: Axis, start: number, dir: 1 | -1, max: number, box: Rect) {
  const first = lineIn(image, axis, start, box)
  if (!first.flat) return { length: 0, mean: first.mean }
  let length = 1
  while (length < max) {
    const next = lineIn(image, axis, start + dir * length, box)
    if (!next.flat || Math.abs(next.mean - first.mean) >= SAME_GREY) break
    length++
  }
  return { length, mean: first.mean }
}

/**
 * The picture without a screenshot's frame. A side is trimmed only when its opposite side has a flat band of the same
 * grey too: one design with a plain top (a cover's colour block) is not a frame.
 */
export function contentBox(image: Gray): Rect {
  const full: Rect = { x: 0, y: 0, width: image.width, height: image.height }
  const maxX = Math.floor(image.width * MAX_MARGIN)
  const maxY = Math.floor(image.height * MAX_MARGIN)
  const left = flatRun(image, 'col', 0, 1, maxX, full)
  const right = flatRun(image, 'col', image.width - 1, -1, maxX, full)
  const top = flatRun(image, 'row', 0, 1, maxY, full)
  const bottom = flatRun(image, 'row', image.height - 1, -1, maxY, full)
  const framed = (a: typeof left, b: typeof left) => a.length > 0 && b.length > 0 && Math.abs(a.mean - b.mean) < SAME_GREY
  const [l, r] = framed(left, right) ? [left.length, right.length] : [0, 0]
  const [t, b] = framed(top, bottom) ? [top.length, bottom.length] : [0, 0]
  return { x: l, y: t, width: image.width - l - r, height: image.height - t - b }
}

interface Profile {
  /** Step between line i-1 and line i, relative to the box's average step. */
  step: number[]
  /** Whether line i is flat across the whole box. */
  flat: boolean[]
  /** Line i's mean grey. */
  mean: number[]
}

function profileOf(image: Gray, box: Rect, axis: Axis): Profile {
  const length = axis === 'col' ? box.width : box.height
  const span = axis === 'col' ? box.height : box.width
  const raw: number[] = Array.from({ length }, () => 0)
  for (let i = 1; i < length; i++) {
    let sum = 0
    for (let j = 0; j < span; j++) {
      sum +=
        axis === 'col'
          ? Math.abs(at(image, box.x + i, box.y + j) - at(image, box.x + i - 1, box.y + j))
          : Math.abs(at(image, box.x + j, box.y + i) - at(image, box.x + j, box.y + i - 1))
    }
    raw[i] = sum / span
  }
  const mean = raw.reduce((a, b) => a + b, 0) / Math.max(1, length - 1) || 1
  const start = axis === 'col' ? box.x : box.y
  const lines = Array.from({ length }, (_, i) => lineIn(image, axis, start + i, box))
  return {
    step: raw.map((value) => value / mean),
    flat: lines.map((item) => item.flat),
    mean: lines.map((item) => item.mean),
  }
}

/** Screenshots are rarely split on exact pixels: a cut may sit a few pixels off the even split. */
const reachOf = (length: number) => Math.max(2, Math.round(length * 0.006))

/**
 * Where the cut near `position` really is, in box coordinates: a flat gutter straddling it (start…end, both kept out
 * of either cell), else the sharpest step, else null when there is no seam there.
 */
function findCut(profile: Profile, position: number, cell: number): { start: number; end: number } | null {
  const length = profile.step.length
  const reach = reachOf(length)
  const maxGutter = Math.max(1, Math.floor(cell * MAX_GUTTER))
  for (let i = Math.max(1, position - reach); i <= Math.min(length - 2, position + reach); i++) {
    if (!profile.flat[i]) continue
    // One grey only: a gutter next to a design's plain edge must not swallow that edge.
    const same = (j: number) => profile.flat[j] && Math.abs(profile.mean[j] - profile.mean[i]) < SAME_GREY
    let start = i
    let end = i
    while (start > 0 && same(start - 1) && end - start < maxGutter) start--
    while (end < length - 1 && same(end + 1) && end - start < maxGutter) end++
    // A gutter has a design on both sides; a flat run only on one side is a plain design edge.
    if (start < position && end >= position && end - start < maxGutter) return { start, end }
  }
  let best = 0
  let bestAt = -1
  for (let i = Math.max(1, position - reach); i <= Math.min(length - 1, position + reach); i++) {
    if (profile.step[i] > best) {
      best = profile.step[i]
      bestAt = i
    }
  }
  return best >= MIN_SEAM ? { start: bestAt, end: bestAt - 1 } : null
}

function cutsFor(profile: Profile, count: number): ({ start: number; end: number } | null)[] {
  const length = profile.step.length
  return Array.from({ length: count - 1 }, (_, i) => findCut(profile, Math.round(((i + 1) * length) / count), length / count))
}

/**
 * The finest grid of 3:4-to-1:1 tiles whose every cut lands on a real seam. A coarser grid's cuts are a subset of a
 * finer one's, so the finest passing grid is the right one; 1×1 when nothing passes.
 */
export function detectGrid(image: Gray): GridSize {
  const box = contentBox(image)
  const cols = profileOf(image, box, 'col')
  const rows = profileOf(image, box, 'row')
  let best: GridSize = { cols: 1, rows: 1 }
  for (let c = 1; c <= MAX_GRID_COLS; c++) {
    for (let r = 1; r <= MAX_GRID_ROWS; r++) {
      if (c * r <= best.cols * best.rows) continue
      const aspect = box.width / c / (box.height / r)
      if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue
      if ([...cutsFor(cols, c), ...cutsFor(rows, r)].every(Boolean)) best = { cols: c, rows: r }
    }
  }
  return best
}

/** Cell edges along one axis, in picture coordinates: each cell's first line and its length. */
function spans(profile: Profile, count: number, offset: number, length: number): [number, number][] {
  const cuts = cutsFor(profile, count)
  const result: [number, number][] = []
  let from = 0
  for (let i = 0; i < count; i++) {
    const cut = cuts[i]
    const even = Math.round(((i + 1) * length) / count)
    const to = i === count - 1 ? length : cut ? cut.start : even
    result.push([offset + from, Math.max(1, to - from)])
    from = cut ? cut.end + 1 : even
  }
  return result
}

/**
 * The grid's cells, row by row, each cut on its seam and clear of gutters; a cut without a seam (a grid the owner set
 * by hand) falls on the even split. 1×1 is the whole picture, uncropped.
 */
export function gridCells(image: Gray, grid: GridSize): Rect[] {
  if (grid.cols * grid.rows <= 1) return [{ x: 0, y: 0, width: image.width, height: image.height }]
  const box = contentBox(image)
  const xs = spans(profileOf(image, box, 'col'), grid.cols, box.x, box.width)
  const ys = spans(profileOf(image, box, 'row'), grid.rows, box.y, box.height)
  return ys.flatMap(([y, height]) => xs.map(([x, width]) => ({ x, y, width, height })))
}

/** RGBA pixels (ImageData.data) as greyscale. */
export function toGray(rgba: ArrayLike<number>, width: number, height: number): Gray {
  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round(rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114)
  }
  return { data, width, height }
}
