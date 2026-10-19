'use client'

import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'

/** The official mark from assets/logo assets, cropped to the icon and served from public/brand. */
const MARK_SRC = '/brand/carousely-mark.webp'
/** The loop as a vertical strip of 90 frames at 30fps, so CSS can tell where in the cycle it is. */
export const LOOP_SPRITE_SRC = '/brand/carousely-loop-sprite.webp'
const LOOP_FRAMES = 90
const LOOP_MS = 3000

interface LogoProps {
  /** Height of the icon in px; the wordmark scales with it. */
  size?: number
  /** Icon only, e.g. tight spaces. The name then goes to screen readers. */
  iconOnly?: boolean
  className?: string
}

/** Icon plus the Bricolage wordmark, dark on light surfaces. */
export function CarouselyLogo({ size = 28, iconOnly = false, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-[0.4em] ${className}`} style={{ fontSize: size * 0.72 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK_SRC} alt={iconOnly ? 'Carousely' : ''} width={size} height={size} className="shrink-0" />
      {!iconOnly && <span className="font-display leading-none font-bold tracking-[-0.03em] text-ink">Carousely</span>}
    </span>
  )
}

/*
 * A page that loads quickly would cut the loop off mid-turn. Loaders share one clock: the first one to mount
 * starts it, and when the last one goes away the <LoaderHold> overlay keeps playing until the cycle ends.
 */
type LoopState = { startedAt: number | null; holdUntil: number | null }
const IDLE: LoopState = { startedAt: null, holdUntil: null }
let state = IDLE
let mounted = 0
const listeners = new Set<() => void>()

function setState(next: LoopState) {
  state = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getState = () => state
const getServerState = () => IDLE

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function loaderMounted() {
  mounted += 1
  const stale = state.holdUntil !== null && Date.now() >= state.holdUntil
  if (state.startedAt === null || stale) setState({ startedAt: Date.now(), holdUntil: null })
  else if (state.holdUntil !== null) setState({ ...state, holdUntil: null })
}

function loaderUnmounted() {
  mounted -= 1
  if (mounted > 0 || state.startedAt === null) return
  // Decided in the same commit that removes the loader, so the new page never shows for a frame first. Strict
  // Mode remounts right after, and loaderMounted then cancels the hold.
  const elapsed = Date.now() - state.startedAt
  const cycles = Math.max(1, Math.ceil(elapsed / LOOP_MS))
  if (reducedMotion() || elapsed >= cycles * LOOP_MS - 50) setState(IDLE)
  else setState({ ...state, holdUntil: state.startedAt + cycles * LOOP_MS })
}

function LoopArt({ size, startedAt }: { size: number; startedAt: number | null }) {
  // A negative delay lands every copy of the loop on the same frame of the shared clock.
  const [delay] = useState(() => (startedAt === null ? 0 : -(Date.now() - startedAt)))
  return (
    <>
      <span
        aria-hidden="true"
        className="carousely-loop block motion-reduce:hidden"
        style={
          {
            width: size,
            height: size,
            '--loop-size': `${size}px`,
            '--loop-frames': LOOP_FRAMES,
            animationDuration: `${LOOP_MS}ms`,
            animationTimingFunction: `steps(${LOOP_FRAMES})`,
            animationDelay: `${delay}ms`,
            backgroundImage: `url(${LOOP_SPRITE_SRC})`,
          } as CSSProperties
        }
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK_SRC} alt="" width={size} height={size} className="motion-safe:hidden" />
    </>
  )
}

/** The looping mark, for waits. Reduced motion gets the still mark. */
export function CarouselyLoader({ size = 56, label = 'Memuat…' }: { size?: number; label?: string }) {
  const { startedAt } = useSyncExternalStore(subscribe, getState, getServerState)
  useLayoutEffect(() => {
    loaderMounted()
    return loaderUnmounted
  }, [])
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-sm text-ink-muted">
      <LoopArt key={startedAt ?? 'idle'} size={size} startedAt={startedAt} />
      <span>{label}</span>
    </div>
  )
}

/** Covers the page that has just loaded until the loader's cycle is done, then fades out. */
export function LoaderHold() {
  const { startedAt, holdUntil } = useSyncExternalStore(subscribe, getState, getServerState)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (holdUntil === null) return
    const fade = setTimeout(() => setLeaving(true), Math.max(0, holdUntil - Date.now()))
    const done = setTimeout(
      () => {
        setLeaving(false)
        setState(IDLE)
      },
      Math.max(0, holdUntil - Date.now()) + 160,
    )
    return () => {
      clearTimeout(fade)
      clearTimeout(done)
    }
  }, [holdUntil])

  // Leaving for a page outside this layout must not leave the clock running.
  useEffect(
    () => () => {
      if (mounted === 0) setState(IDLE)
    },
    [],
  )

  if (holdUntil === null) return null
  return (
    <div
      className={`absolute inset-0 z-10 flex items-center justify-center bg-paper transition-opacity duration-150 ${leaving ? 'opacity-0' : ''}`}
    >
      <div role="status" className="flex flex-col items-center gap-3 text-sm text-ink-muted">
        <LoopArt size={56} startedAt={startedAt} />
        <span>Memuat…</span>
      </div>
    </div>
  )
}
