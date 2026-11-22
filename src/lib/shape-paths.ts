/**
 * Shape geometry: the single source of truth for how every shape kind and free vector path is traced, shared by the
 * layer canvas (layer-canvas.ts) and the design renderer (design-canvas.ts). Pure: it only calls path methods on the
 * context it is given, so it runs in the browser, headless Chromium and tests alike.
 */

/** Filled shapes (fill + optional stroke). */
export const CLOSED_SHAPE_KINDS = [
  'rect', 'ellipse', 'triangle', 'rightTriangle', 'diamond', 'pentagon', 'hexagon', 'octagon',
  'star', 'star4', 'burst', 'heart', 'cross', 'ring', 'halfCircle', 'quarterCircle', 'parallelogram', 'trapezoid',
  'chevron', 'blockArrow', 'speechBubble', 'cloud', 'ribbon', 'shield', 'teardrop', 'moon', 'frame',
  'arch', 'pill', 'squircle', 'blob', 'flower',
] as const
/** Stroke-only shapes: never filled. */
export const LINE_KINDS = ['line', 'arrow', 'doubleArrow', 'curve', 'zigzag', 'wave', 'elbow'] as const
/** Every value a shape layer's `shape` (and a design ShapeNode's `kind`, besides 'path') may take. */
export const SHAPE_KINDS = [...CLOSED_SHAPE_KINDS, ...LINE_KINDS] as const

export type ClosedShapeKind = (typeof CLOSED_SHAPE_KINDS)[number]
export type LineKind = (typeof LINE_KINDS)[number]
export type ShapeKind = (typeof SHAPE_KINDS)[number]

const SHAPE_SET: ReadonlySet<unknown> = new Set(SHAPE_KINDS)
const LINE_SET: ReadonlySet<unknown> = new Set(LINE_KINDS)
export const isShapeKind = (value: unknown): value is ShapeKind => SHAPE_SET.has(value)
export const isLineKind = (value: unknown): value is LineKind => LINE_SET.has(value)

/** Shapes with a hole: their fill needs the even-odd rule. */
const EVEN_ODD: ReadonlySet<ShapeKind> = new Set<ShapeKind>(['ring', 'frame', 'moon'])
export const shapeFillRule = (kind: ShapeKind): CanvasFillRule => (EVEN_ODD.has(kind) ? 'evenodd' : 'nonzero')

// ---------- Stroke style ----------

export const STROKE_DASHES = ['dashed', 'dotted'] as const
/** Absent means a solid stroke. */
export type StrokeDash = (typeof STROKE_DASHES)[number]
export const isStrokeDash = (value: unknown): value is StrokeDash => value === 'dashed' || value === 'dotted'

export interface StrokeStyle {
  /** For setLineDash; empty is solid. */
  segments: number[]
  cap: CanvasLineCap
  join: CanvasLineJoin
}

/**
 * How a stroke of `width` px is dashed, capped and joined. Dash lengths scale with the width; dotted is zero-length
 * dashes with round caps (dots of the stroke's diameter, one diameter apart). Arrows and closed shapes keep miter
 * joins, as before; the other lines and free paths join round.
 */
export function strokeStyle(dash: StrokeDash | undefined, width: number, kind: ShapeKind | 'path'): StrokeStyle {
  const unit = Math.max(1, width)
  const join: CanvasLineJoin = kind === 'path' || (isLineKind(kind) && kind !== 'arrow') ? 'round' : 'miter'
  if (dash === 'dashed') return { segments: [unit * 3, unit * 2], cap: 'butt', join }
  if (dash === 'dotted') return { segments: [0, unit * 2], cap: 'round', join }
  return { segments: [], cap: 'round', join }
}

// ---------- Tracing ----------

/** The part of CanvasRenderingContext2D a path needs; a real 2D context satisfies it. */
export interface PathContext {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void
  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number,
    counterclockwise?: boolean): void
  closePath(): void
  roundRect(x: number, y: number, w: number, h: number, radius: number): void
}

export interface ShapeBox { x: number; y: number; w: number; h: number }

type Pt = readonly [number, number]

/** Points scaled so their bounds are exactly 0..1 on both axes. */
function fit(points: Pt[]): Pt[] {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX || 1
  const spanY = Math.max(...ys) - minY || 1
  return points.map(([x, y]) => [(x - minX) / spanX, (y - minY) / spanY])
}

/** A regular polygon (no `inner`) or star (`inner` = inner/outer radius), first vertex at angle `start`. */
function regular(count: number, start: number, inner?: number): Pt[] {
  const steps = inner === undefined ? count : count * 2
  return fit(Array.from({ length: steps }, (_, index) => {
    const radius = inner !== undefined && index % 2 === 1 ? inner : 1
    const angle = start + (index * 2 * Math.PI) / steps
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const
  }))
}

const third = 1 / 3
/** Unit polygons, in fractions of the box. */
const POLYGONS: Partial<Record<ShapeKind, Pt[]>> = {
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  rightTriangle: [[0, 0], [1, 1], [0, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  pentagon: regular(5, -Math.PI / 2),
  hexagon: regular(6, 0),
  octagon: regular(8, Math.PI / 8),
  star: regular(5, -Math.PI / 2, 0.382),
  star4: regular(4, -Math.PI / 2, 0.35),
  burst: regular(12, -Math.PI / 2, 0.78),
  cross: [[third, 0], [2 * third, 0], [2 * third, third], [1, third], [1, 2 * third], [2 * third, 2 * third],
    [2 * third, 1], [third, 1], [third, 2 * third], [0, 2 * third], [0, third], [third, third]],
  parallelogram: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]],
  trapezoid: [[0.2, 0], [0.8, 0], [1, 1], [0, 1]],
  chevron: [[0, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0, 1], [0.3, 0.5]],
  blockArrow: [[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]],
  ribbon: [[0, 0], [1, 0], [0.88, 0.5], [1, 1], [0, 1], [0.12, 0.5]],
}

/** Unit cubic outlines: a start point, then [c1x, c1y, c2x, c2y, x, y] segments; closed. */
const CURVES: Partial<Record<ShapeKind, { start: Pt; segments: number[][] }>> = {
  heart: { start: [0.5, 1], segments: [
    [0.35, 0.88, 0, 0.62, 0, 0.3], [0, 0.12, 0.14, 0, 0.28, 0], [0.4, 0, 0.48, 0.08, 0.5, 0.18],
    [0.52, 0.08, 0.6, 0, 0.72, 0], [0.86, 0, 1, 0.12, 1, 0.3], [1, 0.62, 0.65, 0.88, 0.5, 1],
  ] },
  cloud: { start: [0.2, 1], segments: [
    [0.05, 1, 0, 0.8, 0.1, 0.68], [0, 0.48, 0.15, 0.3, 0.3, 0.38], [0.32, 0.1, 0.58, 0, 0.68, 0.22],
    [0.82, 0.1, 1, 0.25, 0.92, 0.48], [1, 0.55, 1, 0.95, 0.82, 1],
  ] },
  shield: { start: [0.5, 0], segments: [
    [0.5, 0, 1, 0.15, 1, 0.15], [1, 0.6, 0.8, 0.85, 0.5, 1], [0.2, 0.85, 0, 0.6, 0, 0.15], [0, 0.15, 0.5, 0, 0.5, 0],
  ] },
  teardrop: { start: [0.5, 0], segments: [
    [0.65, 0.2, 1, 0.42, 1, 0.68], [1, 0.86, 0.78, 1, 0.5, 1], [0.22, 1, 0, 0.86, 0, 0.68], [0, 0.42, 0.35, 0.2, 0.5, 0],
  ] },
  squircle: { start: [0.5, 0], segments: [
    [0.9, 0, 1, 0.1, 1, 0.5], [1, 0.9, 0.9, 1, 0.5, 1], [0.1, 1, 0, 0.9, 0, 0.5], [0, 0.1, 0.1, 0, 0.5, 0],
  ] },
  blob: { start: [0.52, 0], segments: [
    [0.8, 0, 1, 0.2, 0.98, 0.46], [0.96, 0.74, 0.76, 1, 0.48, 1], [0.2, 1, 0, 0.8, 0.02, 0.52], [0.04, 0.22, 0.24, 0, 0.52, 0],
  ] },
}

/** A flower of `count` round petals: valleys at `inner` of the radius, petals reaching the box's edge. */
function flower(ctx: PathContext, { x, y, w, h }: ShapeBox, count = 6, inner = 0.55) {
  const step = (Math.PI * 2) / count
  const spread = step * 0.35
  // A cubic's midpoint is 1/8 of each end plus 3/8 of each control: solve for the control radius that peaks at 1.
  const reach = (1 - 0.25 * inner * Math.cos(step / 2)) / (0.75 * Math.cos(spread))
  const at = (angle: number, radius: number) => [x + w / 2 + Math.cos(angle) * radius * w / 2, y + h / 2 + Math.sin(angle) * radius * h / 2] as const
  const start = -Math.PI / 2 - step / 2
  ctx.moveTo(...at(start, inner))
  for (let index = 0; index < count; index++) {
    const axis = start + step / 2 + index * step
    ctx.bezierCurveTo(...at(axis - spread, reach), ...at(axis + spread, reach), ...at(axis + step / 2, inner))
  }
  ctx.closePath()
}

function polyline(ctx: PathContext, points: readonly Pt[], { x, y, w, h }: ShapeBox, close: boolean) {
  points.forEach(([px, py], index) => {
    if (index === 0) ctx.moveTo(x + px * w, y + py * h)
    else ctx.lineTo(x + px * w, y + py * h)
  })
  if (close) ctx.closePath()
}

/** An arrowhead whose tip is at (tipX, cy), opening towards `direction` (-1: left of the tip). */
function head(ctx: PathContext, tipX: number, cy: number, size: number, direction: 1 | -1) {
  ctx.moveTo(tipX + direction * size, cy - size)
  ctx.lineTo(tipX, cy)
  ctx.lineTo(tipX + direction * size, cy + size)
}

/**
 * Traces `kind` into the box as new subpaths; the caller begins the path first and fills (with shapeFillRule) and/or
 * strokes after. `radius` rounds the corners of 'rect' only.
 */
export function traceShape(ctx: PathContext, kind: ShapeKind, box: ShapeBox, radius = 0): void {
  const { x, y, w, h } = box
  const cx = x + w / 2
  const cy = y + h / 2
  const polygon = POLYGONS[kind]
  if (polygon) { polyline(ctx, polygon, box, true); return }
  const curve = CURVES[kind]
  if (curve) {
    const px = (value: number) => x + value * w
    const py = (value: number) => y + value * h
    ctx.moveTo(px(curve.start[0]), py(curve.start[1]))
    for (const [c1x, c1y, c2x, c2y, ex, ey] of curve.segments) ctx.bezierCurveTo(px(c1x), py(c1y), px(c2x), py(c2y), px(ex), py(ey))
    ctx.closePath()
    return
  }
  switch (kind) {
    case 'rect': ctx.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2)); return
    case 'pill': ctx.roundRect(x, y, w, h, Math.min(w, h) / 2); return
    case 'arch': {
      const r = Math.min(h, w / 2)
      ctx.moveTo(x, y + h)
      ctx.lineTo(x, y + r)
      ctx.ellipse(cx, y + r, w / 2, r, 0, Math.PI, Math.PI * 2)
      ctx.lineTo(x + w, y + h)
      ctx.closePath()
      return
    }
    case 'flower': flower(ctx, box); return
    case 'ellipse': ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); return
    case 'ring': {
      // The hole runs the other way, so it stays open under either fill rule.
      ctx.moveTo(x + w, cy)
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
      ctx.closePath()
      ctx.moveTo(cx + w * 0.3, cy)
      ctx.ellipse(cx, cy, w * 0.3, h * 0.3, 0, 0, -Math.PI * 2, true)
      ctx.closePath()
      return
    }
    case 'frame': {
      const t = Math.min(w, h) * 0.15
      polyline(ctx, [[0, 0], [1, 0], [1, 1], [0, 1]], box, true)
      ctx.moveTo(x + t, y + t)
      ctx.lineTo(x + t, y + h - t)
      ctx.lineTo(x + w - t, y + h - t)
      ctx.lineTo(x + w - t, y + t)
      ctx.closePath()
      return
    }
    case 'halfCircle':
      ctx.moveTo(x, y + h)
      ctx.ellipse(cx, y + h, w / 2, h, 0, Math.PI, Math.PI * 2)
      ctx.closePath()
      return
    case 'quarterCircle':
      ctx.moveTo(x, y + h)
      ctx.lineTo(x, y)
      ctx.ellipse(x, y + h, w, h, 0, -Math.PI / 2, 0)
      ctx.closePath()
      return
    case 'moon': {
      // Two equal ellipses one radius apart; the crescent is the left one minus the right one, traced as one
      // outline. They cross at ±60°, so the horns reach the box's right edge when the radius is 2/3 of its width.
      const rx = (w * 2) / 3
      const ry = h / 2
      const angle = Math.PI / 3
      const left = x + rx
      ctx.moveTo(left + rx * Math.cos(angle), cy - ry * Math.sin(angle))
      ctx.ellipse(left, cy, rx, ry, 0, -angle, angle, true)
      ctx.ellipse(left + rx, cy, rx, ry, 0, Math.PI - angle, Math.PI + angle, false)
      ctx.closePath()
      return
    }
    case 'speechBubble': {
      const body = h * 0.8
      const r = Math.min(w, body) * 0.2
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + body - r)
      ctx.quadraticCurveTo(x + w, y + body, x + w - r, y + body)
      ctx.lineTo(x + w * 0.45, y + body)
      ctx.lineTo(x + w * 0.2, y + h)
      ctx.lineTo(x + w * 0.3, y + body)
      ctx.lineTo(x + r, y + body)
      ctx.quadraticCurveTo(x, y + body, x, y + body - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
      return
    }
    case 'line':
    case 'arrow':
    case 'doubleArrow': {
      ctx.moveTo(x, cy)
      ctx.lineTo(x + w, cy)
      const size = Math.min(w / 3, h / 2)
      if (kind !== 'line') head(ctx, x + w, cy, size, -1)
      if (kind === 'doubleArrow') head(ctx, x, cy, size, 1)
      return
    }
    case 'curve':
      ctx.moveTo(x, y + h)
      ctx.quadraticCurveTo(cx, y - h, x + w, y + h)
      return
    case 'zigzag':
    case 'wave': {
      const count = Math.max(2, Math.min(40, Math.round(w / Math.max(h, 1)) * 2))
      const step = w / count
      if (kind === 'zigzag') {
        polyline(ctx, Array.from({ length: count + 1 }, (_, index) => [index / count, index % 2 === 0 ? 1 : 0] as const), box, false)
        return
      }
      // Each half wave peaks at the box's edge: a quadratic's midpoint is halfway to its control point.
      ctx.moveTo(x, cy)
      for (let index = 0; index < count; index++) {
        const start = x + index * step
        ctx.quadraticCurveTo(start + step / 2, index % 2 === 0 ? y - h / 2 : y + h * 1.5, start + step, cy)
      }
      return
    }
    case 'elbow':
      polyline(ctx, [[0, 0], [0.5, 0], [0.5, 1], [1, 1]], box, false)
      return
  }
}

// ---------- Free vector paths ----------

export interface PathVector { x: number; y: number }
/** An anchor with optional bezier handles; in a path layer all are fractions of the layer box. */
export interface PathPoint extends PathVector { in?: PathVector; out?: PathVector }

export const PATH_LIMITS = {
  points: { min: 2, max: 100 },
  /** Fractions of the box; handles (and anchors) may stray a little outside it. */
  coord: { min: -1, max: 2 },
} as const

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const coord = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  && value >= PATH_LIMITS.coord.min && value <= PATH_LIMITS.coord.max
const isVector = (value: unknown): value is PathVector => isObject(value)
  && Object.keys(value).every((key) => key === 'x' || key === 'y') && coord(value.x) && coord(value.y)

/** Fractional path points, checked strictly (unknown keys refused): what a stored path layer or node must hold. */
export function isPathPoints(value: unknown): value is PathPoint[] {
  if (!Array.isArray(value) || value.length < PATH_LIMITS.points.min || value.length > PATH_LIMITS.points.max) return false
  return value.every((point) => isObject(point) && Object.keys(point).every((key) => ['x', 'y', 'in', 'out'].includes(key))
    && coord(point.x) && coord(point.y) && (point.in === undefined || isVector(point.in)) && (point.out === undefined || isVector(point.out)))
}

/** A fresh copy of path points with only the known keys. */
export const copyPathPoints = (points: readonly PathPoint[]): PathPoint[] => points.map((point) => ({
  x: point.x, y: point.y,
  ...(point.in ? { in: { x: point.in.x, y: point.in.y } } : {}),
  ...(point.out ? { out: { x: point.out.x, y: point.out.y } } : {}),
}))

/** Calls `segment` for each segment, closing back to the first point when `closed`. */
function eachSegment(points: readonly PathPoint[], closed: boolean, segment: (from: PathPoint, to: PathPoint) => void) {
  for (let index = 1; index < points.length; index++) segment(points[index - 1], points[index])
  if (closed && points.length > 1) segment(points[points.length - 1], points[0])
}

/**
 * Traces a free path whose points are fractions of `box` (pass {x: 0, y: 0, w: 1, h: 1} for absolute points). A
 * segment is a cubic bezier through `from.out` and `to.in` when either exists, else straight.
 */
export function tracePath(ctx: PathContext, points: readonly PathPoint[], closed: boolean, box: ShapeBox): void {
  if (points.length === 0) return
  const px = (value: number) => box.x + value * box.w
  const py = (value: number) => box.y + value * box.h
  ctx.moveTo(px(points[0].x), py(points[0].y))
  eachSegment(points, closed, (from, to) => {
    if (!from.out && !to.in) { ctx.lineTo(px(to.x), py(to.y)); return }
    const c1 = from.out ?? from
    const c2 = to.in ?? to
    ctx.bezierCurveTo(px(c1.x), py(c1.y), px(c2.x), py(c2.y), px(to.x), py(to.y))
  })
  if (closed) ctx.closePath()
}

const BOUNDS_SAMPLES = 24

/** The drawn extent of a path (curves sampled, handles themselves excluded), in the points' own units. */
export function pathBounds(points: readonly PathPoint[], closed: boolean): ShapeBox {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  add(points[0].x, points[0].y)
  eachSegment(points, closed, (from, to) => {
    add(to.x, to.y)
    if (!from.out && !to.in) return
    const c1 = from.out ?? from
    const c2 = to.in ?? to
    for (let step = 1; step < BOUNDS_SAMPLES; step++) {
      const t = step / BOUNDS_SAMPLES
      const u = 1 - t
      const a = u * u * u
      const b = 3 * u * u * t
      const c = 3 * u * t * t
      const d = t * t * t
      add(a * from.x + b * c1.x + c * c2.x + d * to.x, a * from.y + b * c1.y + c * c2.y + d * to.y)
    }
  })
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
