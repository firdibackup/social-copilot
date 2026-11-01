'use client'

import { useEffect, useRef, useState } from 'react'
import { MimoMascot } from '@/components/mimo-mascot'
import type { Expression } from '@/lib/mascot-expression'
import styles from './mimo-tour.module.css'

/*
 * Mimo's scroll tour (spec: docs/mimo-tour-spec.md). One fixed layer above the page carries the mascot and its speech
 * bubble. Sections mark "stops" with `data-tour-stop`; each stop is a scroll range in which Mimo perches on an element,
 * and between stops it flies along an arc. A single rAF loop drives everything with springs and writes straight to the
 * DOM, then idles once everything is at rest. Mimo never falls asleep on the homepage.
 */

export interface Point {
  x: number
  y: number
}
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}
export interface Range {
  from: number
  to: number
}
export type Side = 'top' | 'right' | 'left' | 'center'
export type Phase = { kind: 'perch'; index: number } | { kind: 'flight'; from: number; to: number; u: number }

/** The mascot is drawn at this size and scaled to the live size, so the SVG never re-renders. */
const BASE = 200
const FACES = new Set<string>(['idle', 'smile', 'happy', 'wink', 'wow'])
const SIDES = new Set<string>(['top', 'right', 'left', 'center'])
const TOUR_ATTRS = ['data-tour-stop', 'data-tour-anchor', 'data-tour-side', 'data-tour-aim', 'data-tour-face', 'data-tour-fx', 'data-tour-say', 'data-tour-press', 'data-tour-grow', 'data-tour-dock']
/** Mimo presses a stop's button once the page has been still this long (or mid-range while scrolling slowly). */
const SETTLE_MS = 280
/** How long Mimo holds a press before it hops back to its perch. */
const PRESS_MS = 650
const BLINK_MS = 130

// ---------------------------------------------------------------------------------------------------------------------
// Pure helpers (exported for tests)

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Base mascot size in px: 74 on phones, otherwise 13% of the viewport height within 86..124. */
export const baseSize = (innerWidth: number, innerHeight: number) => (innerWidth < 760 ? 74 : clamp(innerHeight * 0.13, 86, 124))

/** A stop's scroll range: it starts when its top reaches 62% of the viewport (the first stop starts at 0). */
export function stopRange(absTop: number, absBottom: number, innerHeight: number, first: boolean): Range {
  const from = first ? 0 : absTop - innerHeight * 0.62
  return { from, to: Math.max(from, absBottom - innerHeight * 0.62) }
}

/** Ranges closer than 30px (or overlapping) are split at their midpoint, leaving a 40px flight between them. */
export function splitRanges(ranges: readonly Range[]): Range[] {
  const out = ranges.map(range => ({ ...range }))
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]
    const next = out[i]
    if (next.from < prev.to + 30) {
      const mid = (prev.to + next.from) / 2
      prev.to = Math.max(prev.from, mid - 20)
      next.from = mid + 20
      next.to = Math.max(next.to, next.from)
    }
  }
  return out
}

/** Where the scroll position is: perched on a stop, or flying from one to the next with eased progress `u`. */
export function resolvePhase(scrollY: number, ranges: readonly Range[]): Phase | null {
  if (!ranges.length) return null
  for (let i = 0; i < ranges.length; i++) {
    if (scrollY > ranges[i].to) continue
    if (i > 0 && scrollY < ranges[i].from) {
      const start = ranges[i - 1].to
      const span = ranges[i].from - start
      return { kind: 'flight', from: i - 1, to: i, u: easeInOut(span > 0 ? clamp((scrollY - start) / span) : 1) }
    }
    return { kind: 'perch', index: i }
  }
  return { kind: 'perch', index: ranges.length - 1 }
}

/** Where Mimo sits on an element. `right`/`left` fall back to `top` when the viewport has no room beside it. */
export function perchPoint(rect: Box, side: Side, size: number, innerWidth: number): Point {
  if (side === 'right' && innerWidth - rect.right >= size * 1.05) return { x: rect.right + size * 0.56, y: rect.top + rect.height / 2 }
  if (side === 'left' && rect.left >= size * 1.05) return { x: rect.left - size * 0.56, y: rect.top + rect.height / 2 }
  if (side === 'center') return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  return { x: rect.left + rect.width * 0.86, y: rect.top - size * 0.33 }
}

/** A docked stop: Mimo sits in the anchor (a seat), sized so its body fills it. */
export const dockSize = (rect: Box) => rect.width * 1.35

/** Where Mimo stands to press a button (use the press size, `s * .8`). */
export const pressPoint = (rect: Box, size: number): Point => ({ x: rect.left + rect.width / 2, y: rect.top - size * 0.3 })

/** Keeps the mascot inside the viewport, below the header. */
export const clampSpot = (point: Point, size: number, innerWidth: number, innerHeight: number): Point => ({
  x: clamp(point.x, size / 2 + 6, innerWidth - size / 2 - 6),
  y: clamp(point.y, 70 + size * 0.3, innerHeight - size * 0.45),
})

/** The arc's control point: halfway across, lifted above the higher end by 35% of the distance (24px..28vh). */
export function flightControl(a: Point, b: Point, innerHeight: number): Point {
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  return { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - clamp(dist * 0.35, 24, innerHeight * 0.28) }
}

export function quadBezier(a: Point, c: Point, b: Point, u: number): Point {
  const v = 1 - u
  return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y }
}

export const flightPoint = (a: Point, b: Point, u: number, innerHeight: number) => quadBezier(a, flightControl(a, b, innerHeight), b, u)

/** True in the middle of a stop's range (±4.5% of the viewport height of scroll): the "press the button" moment. */
export const inPressWindow = (scrollY: number, range: Range, innerHeight: number) =>
  Math.abs(scrollY - (range.from + range.to) / 2) <= innerHeight * 0.045

/** Speed stretch: positive when moving vertically (taller), negative when moving sideways (wider). */
export function speedStretch(vx: number, vy: number) {
  const speed = Math.hypot(vx, vy)
  if (speed < 1e-3) return 0
  return clamp(speed / 2600, 0, 0.16) * ((2 * Math.abs(vy)) / speed - 1)
}

// ---------------------------------------------------------------------------------------------------------------------
// Component

export function MimoTour({ enabled }: { enabled: boolean }) {
  const [mounted, setMounted] = useState(false)
  const layer = useRef<HTMLDivElement>(null)
  const mascot = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  const active = mounted && enabled

  useEffect(() => {
    // Client only and after hydration: the server and first client render are empty.
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (!active) return
    const nodes = { layer: layer.current, mascot: mascot.current, slot: slot.current, bubble: bubble.current, text: text.current }
    if (!nodes.layer || !nodes.mascot || !nodes.slot || !nodes.bubble || !nodes.text) return
    return startTour(nodes as TourNodes)
  }, [active])

  if (!active) return null
  return (
    <div ref={layer} className={styles.layer} aria-hidden="true" data-mimo-tour="">
      <div ref={slot} className={styles.slot} data-side="right">
        <div ref={bubble} className={styles.bubble}>
          <span ref={text} />
        </div>
      </div>
      <div ref={mascot} className={styles.mascot}>
        <MimoMascot still size={BASE} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Engine

interface TourNodes {
  layer: HTMLDivElement
  mascot: HTMLDivElement
  slot: HTMLDivElement
  bubble: HTMLDivElement
  text: HTMLSpanElement
}

interface Stop {
  name: string
  el: HTMLElement
  anchor: HTMLElement
  aim: HTMLElement | null
  press: HTMLElement | null
  side: Side
  face: Expression
  fx: 'elastic' | 'glow' | null
  say: string
  grow: boolean
  /** Sit inside the anchor and scroll with it: no viewport clamp, no bubble. */
  dock: boolean
  height: number
}

function find(stop: HTMLElement, selector: string | null): HTMLElement | null {
  if (!selector) return null
  try {
    return stop.querySelector<HTMLElement>(selector) ?? document.querySelector<HTMLElement>(selector)
  } catch {
    return null
  }
}

const isEmpty = (rect: Box) => !rect.width && !rect.height

function startTour({ layer, mascot, slot, bubble, text }: TourNodes): () => void {
  const svg = mascot.querySelector('svg')
  const face = mascot.querySelector<SVGGElement>('.face')
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
  }

  let disposed = false
  let stops: Stop[] = []
  let ranges: Range[] = []
  let dirty = true
  let raf = 0
  let lastT = 0
  let lastScroll = Number.NaN

  // Springs
  let started = false
  let x = 0
  let y = 0
  let vx = 0
  let vy = 0
  let size = 0
  let a = 0
  let va = 0
  let h = 0
  let vh = 0
  let press = 0
  let eyeX = 0
  let eyeY = 0
  let prevTx = 0
  let prevTy = 0

  // Story state
  let perched: Stop | null | undefined
  let landing: { since: number } | null = null
  let glowStart = -1
  let burstFace: Expression | null = null
  let burstUntil = 0
  let mutationTimer: ReturnType<typeof setTimeout> | undefined
  let expression = svg?.dataset.e ?? ''
  let pressedEl: HTMLElement | null = null
  /** Press story for the current visit: waiting → pressing until `pressUntil` → done. Reset on every arrival. */
  let pressPhase: 'wait' | 'press' | 'done' = 'wait'
  let pressUntil = 0
  let movedAt = 0
  let docked = false
  let layerDocked = false
  let bubbleOpen = false
  let bubbleClosedAt = -Infinity
  let bubbleText = ''
  let bubbleW = 0
  let bubbleH = 0
  let bubbleSide = 'right'
  let shown: boolean | null = null
  let filtered = false

  const measureBubble = () => {
    bubbleW = slot.offsetWidth
    bubbleH = slot.offsetHeight
  }

  const measure = () => {
    const sy = scrollY
    const ih = innerHeight
    const found: { el: HTMLElement; top: number; bottom: number; height: number }[] = []
    for (const el of document.querySelectorAll<HTMLElement>('[data-tour-stop]')) {
      if (layer.contains(el)) continue
      const rect = el.getBoundingClientRect()
      if (isEmpty(rect)) continue
      found.push({ el, top: rect.top + sy, bottom: rect.bottom + sy, height: rect.height })
    }
    found.sort((p, q) => p.top - q.top)
    ranges = splitRanges(found.map((stop, i) => stopRange(stop.top, stop.bottom, ih, i === 0)))
    stops = found.map(({ el, height }, i) => {
      const faceAttr = el.dataset.tourFace ?? ''
      const sideAttr = el.dataset.tourSide ?? ''
      const fx = el.dataset.tourFx
      return {
        name: el.dataset.tourStop ?? '',
        el,
        anchor: find(el, el.dataset.tourAnchor ?? null) ?? el,
        aim: find(el, el.dataset.tourAim ?? null),
        press: find(el, el.dataset.tourPress ?? null),
        side: (SIDES.has(sideAttr) ? sideAttr : 'top') as Side,
        face: (FACES.has(faceAttr) ? faceAttr : 'idle') as Expression,
        fx: fx === 'elastic' || fx === 'glow' ? fx : null,
        say: el.dataset.tourSay ?? '',
        grow: i === 0 && el.hasAttribute('data-tour-grow'),
        dock: el.hasAttribute('data-tour-dock'),
        height,
      }
    })
    if (perched && !stops.includes(perched)) perched = stops.find(stop => stop.el === perched?.el) ?? null
    if (bubbleText) measureBubble()
  }

  const anchorRect = (stop: Stop): Box => {
    const rect = stop.anchor.isConnected ? stop.anchor.getBoundingClientRect() : null
    return rect && !isEmpty(rect) ? rect : stop.el.getBoundingClientRect()
  }
  const perchSpot = (stop: Stop, s: number, iw: number, ih: number): Point => {
    const rect = anchorRect(stop)
    if (stop.dock) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    return clampSpot(perchPoint(rect, stop.side, s, iw), s, iw, ih)
  }
  const onScreen = (el: HTMLElement | null, ih: number) => {
    if (!el?.isConnected) return false
    const rect = el.getBoundingClientRect()
    return !isEmpty(rect) && rect.top > 60 && rect.bottom < ih - 8
  }

  const wake = () => {
    if (!raf && !disposed && !document.hidden) raf = requestAnimationFrame(frame)
  }
  const remeasure = () => {
    dirty = true
    wake()
  }
  const burst = (expr: Expression, ms: number) => {
    burstFace = expr
    burstUntil = performance.now() + ms
    later(wake, ms + 20)
    wake()
  }

  function frame(now: number) {
    raf = 0
    if (disposed || document.hidden) return
    if (dirty) {
      dirty = false
      measure()
    }
    const dt = lastT ? clamp((now - lastT) / 1000, 0.001, 0.033) : 1 / 60
    lastT = now
    const t = now / 1000
    const iw = innerWidth
    const ih = innerHeight
    const sy = scrollY

    const phase = resolvePhase(sy, ranges)
    if (!phase) {
      if (shown !== false) layer.style.visibility = 'hidden'
      shown = false
      lastScroll = sy
      lastT = 0
      return
    }

    // 1. Target: where Mimo should be, how big, what it looks at.
    const s0 = baseSize(iw, ih)
    const first = stops[0]
    const grow = first.grow ? smoothstep(0.03, 0.15, sy / Math.max(1, first.height)) : 1
    /** Each stop's size: the first one grows in from nothing as the page starts to scroll. */
    const stopSize = (index: number) => (stops[index].dock ? dockSize(anchorRect(stops[index])) : index === 0 ? s0 * grow : s0)
    if (sy !== lastScroll) movedAt = now
    let here: Stop | null = null
    let target: Point
    let targetSize = s0
    let aim: Point | null = null
    let flightWow = false
    let pressing = false
    if (phase.kind === 'perch') {
      here = stops[phase.index]
      targetSize = stopSize(phase.index)
      // Press when the visitor pauses here (or slowly passes the middle), never only at one scroll position, so a
      // fast scroll that stops on a section still gets the demo.
      if (here !== perched) pressPhase = 'wait'
      if (pressPhase === 'wait' && !landing && onScreen(here.press, ih) && (now - movedAt >= SETTLE_MS || inPressWindow(sy, ranges[phase.index], ih))) {
        // A disabled button means the demo is already running (e.g. it auto-played on arrival): nothing to press.
        pressPhase = (here.press as HTMLButtonElement).disabled ? 'done' : 'press'
        pressUntil = now + PRESS_MS + 450
      }
      if (pressPhase === 'press' && (now > pressUntil || !here.press?.isConnected)) pressPhase = 'done'
      if (pressPhase === 'press' && here.press) {
        targetSize *= 0.8
        target = clampSpot(pressPoint(here.press.getBoundingClientRect(), targetSize), targetSize, iw, ih)
        pressing = true
      } else {
        target = perchSpot(here, targetSize, iw, ih)
      }
      if (here.aim?.isConnected) {
        const rect = here.aim.getBoundingClientRect()
        aim = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      }
    } else {
      const sizeA = stopSize(phase.from)
      const sizeB = stopSize(phase.to)
      const from = clampSpot(perchSpot(stops[phase.from], sizeA, iw, ih), sizeA, iw, ih)
      const to = clampSpot(perchSpot(stops[phase.to], sizeB, iw, ih), sizeB, iw, ih)
      target = flightPoint(from, to, phase.u, ih)
      targetSize = lerp(sizeA, sizeB, phase.u)
      flightWow = phase.u > 0.12 && phase.u < 0.88 && Math.hypot(to.x - from.x, to.y - from.y) > targetSize * 1.3
    }
    const tx = target.x
    const ty = target.y

    // A jump (first frame, anchor link) teleports instead of flying across the page.
    if (!started || Math.hypot(tx - prevTx, ty - prevTy) > ih * 1.1) {
      x = tx
      y = ty
      vx = vy = 0
      if (!started) size = targetSize
      started = true
    }
    prevTx = tx
    prevTy = ty

    // 2. Physics.
    vx += (169 * (tx - x) - 2 * 0.72 * 13 * vx) * dt
    x += vx * dt
    vy += (169 * (ty - y) - 2 * 0.72 * 13 * vy) * dt
    y += vy * dt
    size += (targetSize - size) * (1 - Math.exp(-9 * dt))
    va += (-324 * a - 7.9 * va) * dt
    a += va * dt
    vh += (-196 * h - 14 * vh) * dt
    h += vh * dt
    const gap = Math.hypot(tx - x, ty - y)
    // Docked: once there, stick to the seat exactly so it scrolls with the page instead of trailing behind.
    if (here !== perched) docked = false
    if (here?.dock && (docked || gap < 3)) {
      docked = true
      x = tx
      y = ty
      vx = vy = 0
    }
    const pressWant = pressing && gap < targetSize * 0.35 ? 1 : 0
    press += (pressWant - press) * (1 - Math.exp(-18 * dt))

    // 3. Story: stop changes, landing, press.
    if (here !== perched) {
      const before = perched
      perched = here
      landing = before !== undefined && here ? { since: t } : null
      dispatchEvent(new CustomEvent('mimo-tour', { detail: { stop: here?.name ?? null } }))
    }
    if (landing && here && (gap < targetSize * 0.3 || t - landing.since > 0.7)) {
      va += 6
      if (here.fx === 'elastic') va += 11
      if (here.fx === 'glow') glowStart = t
      landing = null
    }
    const nextPressed = pressing && press > 0.5 ? here?.press ?? null : null
    if (nextPressed !== pressedEl) {
      pressedEl?.removeAttribute('data-tour-pressed')
      nextPressed?.setAttribute('data-tour-pressed', '')
      pressedEl = nextPressed
    }

    // 4. Shape.
    const c = speedStretch(vx, vy)
    let sx = (1 - c * 0.8) * (1 + a * 0.2 + press * 0.14)
    let sy2 = (1 + c) * (1 - a * 0.2 - press * 0.2)
    const breath = Math.sin(t * 2.4) * 0.014
    sx *= 1 - breath * 0.6
    sy2 *= 1 + breath
    const rotate = clamp(vx * 0.011, -15, 15)
    const lift = h + (1 - sy2) * size * 0.33
    let glow = 0
    if (glowStart >= 0) {
      const k = (t - glowStart) / 0.75
      if (k >= 1) glowStart = -1
      else glow = Math.sin(Math.PI * k)
    }

    // 5. Face: a burst beats the flight's wow, then the stop's own face.
    if (burstFace && now >= burstUntil) burstFace = null
    const expr: Expression = burstFace ?? (flightWow ? 'wow' : (here?.face ?? 'idle'))
    if (svg && expr !== expression) {
      svg.dataset.e = expr
      expression = expr
    }
    const reach = size * 1.4 + 1
    let lookX = 0
    let lookY = 0
    if (aim) {
      lookX = clamp((aim.x - x) / reach, -1, 1)
      lookY = clamp((aim.y - y) / reach, -1, 1)
    } else if (!here) {
      lookX = clamp((vx * 0.12) / reach, -1, 1)
      lookY = clamp((vy * 0.12) / reach, -1, 1)
    }
    const eyeK = 1 - Math.exp(-10 * dt)
    eyeX += (lookX - eyeX) * eyeK
    eyeY += (lookY - eyeY) * eyeK

    // 6. Bubble: only while perched and arrived.
    // New text waits until the old bubble has popped out (.12s).
    const say = here?.say ?? ''
    if (say && say !== bubbleText && !bubbleOpen && now - bubbleClosedAt > 130) {
      text.textContent = say
      bubbleText = say
      measureBubble()
    }
    const open = !!say && !here?.dock && say === bubbleText && size >= s0 * 0.7 && !landing && gap < targetSize * 0.6
    if (open !== bubbleOpen) {
      bubble.toggleAttribute('data-open', open)
      bubbleOpen = open
      if (!open) bubbleClosedAt = now
    }

    // 7. Writes.
    const visible = size >= 4
    if (visible !== shown) {
      layer.style.visibility = visible ? 'visible' : 'hidden'
      shown = visible
    }
    // Docked, the layer leaves the viewport and lives in page coordinates, so native scrolling carries it with the seat.
    if (docked !== layerDocked) {
      layer.style.position = docked ? 'absolute' : ''
      layerDocked = docked
    }
    const pageY = docked ? sy : 0
    layer.style.transform = `translate3d(${x.toFixed(2)}px, ${(y + pageY + lift).toFixed(2)}px, 0)`
    const scale = size / BASE
    mascot.style.transform = `translate(-50%, -50%) rotate(${rotate.toFixed(2)}deg) scale(${(scale * sx).toFixed(4)}, ${(scale * sy2).toFixed(4)})`
    if (glow || filtered) {
      mascot.style.filter = glow ? `brightness(${(1 + glow * 0.35).toFixed(3)}) saturate(${(1 + glow * 0.5).toFixed(3)})` : ''
      filtered = glow > 0
    }
    if (face) face.style.transform = `translate(${(eyeX * 7).toFixed(2)}px, ${(eyeY * 6).toFixed(2)}px)`
    if (bubbleText) {
      const side_ = size * 0.42 + 10
      const roomRight = iw - 8 - (x + side_)
      const roomLeft = x - side_ - 8
      const side = roomRight >= bubbleW || roomRight >= roomLeft ? 'right' : 'left'
      const bx = clamp(x + (side === 'right' ? side_ : -side_ - bubbleW), 8, Math.max(8, iw - bubbleW - 8)) - x
      const by = clamp(y - size * 0.32 - bubbleH / 2, 8, Math.max(8, ih - bubbleH - 8)) - y
      if (side !== bubbleSide) {
        slot.dataset.side = side
        bubbleSide = side
      }
      slot.style.transform = `translate3d(${bx.toFixed(1)}px, ${(by - lift).toFixed(1)}px, 0)`
      slot.style.setProperty('--tail-y', `${clamp(-size * 0.32 - by, 12, Math.max(12, bubbleH - 12)).toFixed(1)}px`)
    }

    // 8. Stop the loop when everything has settled and the page is still.
    const resting =
      Math.abs(tx - x) < 0.5 &&
      Math.abs(ty - y) < 0.5 &&
      Math.abs(vx) < 4 &&
      Math.abs(vy) < 4 &&
      Math.abs(targetSize - size) < 0.5 &&
      Math.abs(a) < 0.02 &&
      Math.abs(va) < 0.1 &&
      Math.abs(h) < 0.5 &&
      Math.abs(vh) < 4 &&
      Math.abs(pressWant - press) < 0.02 &&
      Math.abs(lookX - eyeX) < 0.02 &&
      Math.abs(lookY - eyeY) < 0.02 &&
      glowStart < 0 &&
      !landing &&
      !(say && say !== bubbleText) &&
      sy === lastScroll
    lastScroll = sy
    // Still waiting to press: the loop may rest, but check back once the page has settled.
    const waiting = !!here?.press?.isConnected && (pressPhase === 'press' || (pressPhase === 'wait' && now - movedAt < SETTLE_MS + 50))
    if (resting) {
      lastT = 0
      if (waiting) later(wake, pressPhase === 'press' ? pressUntil - now + 20 : SETTLE_MS - (now - movedAt) + 20)
    } else raf = requestAnimationFrame(frame)
  }

  // Blinks run on timers so they keep going while the loop sleeps.
  const blink = () =>
    later(() => {
      if (!svg) return blink()
      svg.setAttribute('data-blink', '')
      later(() => {
        svg.removeAttribute('data-blink')
        blink()
      }, BLINK_MS)
    }, 2800 + Math.random() * 2600)

  const onInput = () => wake()
  const onClick = () => {
    onInput()
    const k = 1.3
    vh -= 460 * k * (Math.max(size, 60) / 100)
    va += 5 * k
    if (Math.random() < 0.5) va += 11
    else glowStart = performance.now() / 1000
    burst('happy', 900)
  }
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else {
      lastT = 0
      wake()
    }
  }
  const onMutations = (records: MutationRecord[]) => {
    // Throttled, not debounced, so a section that keeps changing can't starve the re-measure.
    if (mutationTimer || records.every(record => layer.contains(record.target))) return
    mutationTimer = setTimeout(() => {
      mutationTimer = undefined
      remeasure()
    }, 150)
  }

  const passive = { passive: true } as const
  const inputs = ['scroll', 'wheel', 'pointermove', 'pointerdown', 'keydown', 'touchstart'] as const
  for (const type of inputs) addEventListener(type, onInput, passive)
  addEventListener('resize', remeasure, passive)
  document.addEventListener('visibilitychange', onVisibility)
  mascot.addEventListener('click', onClick)
  const resizes = new ResizeObserver(remeasure)
  resizes.observe(document.body)
  const mutations = new MutationObserver(onMutations)
  mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: TOUR_ATTRS })
  document.fonts?.ready.then(() => {
    if (!disposed) remeasure()
  })
  later(remeasure, 1000)
  blink()
  wake()

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    raf = 0
    for (const id of timers) clearTimeout(id)
    timers.clear()
    clearTimeout(mutationTimer)
    for (const type of inputs) removeEventListener(type, onInput)
    removeEventListener('resize', remeasure)
    document.removeEventListener('visibilitychange', onVisibility)
    mascot.removeEventListener('click', onClick)
    resizes.disconnect()
    mutations.disconnect()
    pressedEl?.removeAttribute('data-tour-pressed')
    pressedEl = null
    svg?.removeAttribute('data-blink')
  }
}
