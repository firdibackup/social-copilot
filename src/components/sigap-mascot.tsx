'use client'

import { useEffect, useId, useRef } from 'react'
import { MOOD_EXPRESSION, resolveExpression, type Expression, type MascotState, type Mood } from '@/lib/mascot-expression'

interface SigapMascotProps {
  size?: number
  /** What Sigap is doing; the mascot adds blinks, sleep and reactions on top. */
  mood?: Mood
  /** Change the number to make the mascot cheer: a bounce and a happy face. */
  pulse?: number
  /** A still face, no timers or pointer tracking: for the small marks beside messages. */
  still?: boolean
  className?: string
}

const IDLE_MS = 12_000
const BURST_MS = 900
const BLINK_MS = 130

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Sigap's mascot: one SVG with every face drawn, `data-e` picks the expression (CSS in globals.css). A live one blinks,
 * looks at the pointer and at the field being typed in, smiles when hovered or typed to, falls asleep after a while and
 * cheers when clicked. Timers write to the DOM directly, so no render runs per blink.
 */
export function SigapMascot({ size = 96, mood = 'idle', pulse = 0, still = false, className = '' }: SigapMascotProps) {
  const id = useId()
  const svg = useRef<SVGSVGElement>(null)
  const face = useRef<SVGGElement>(null)
  const state = useRef<MascotState>({ mood, burst: null, blink: false, sleepy: false, attentive: false })
  const cheer = useRef<(() => void) | null>(null)
  const live = !still

  useEffect(() => {
    const el = svg.current
    state.current.mood = mood
    if (el) el.dataset.e = resolveExpression(state.current)
  }, [mood])

  useEffect(() => {
    if (pulse > 0) cheer.current?.()
  }, [pulse])

  useEffect(() => {
    const el = svg.current
    const faceEl = face.current
    if (!live || !el || !faceEl) return
    const s = state.current
    let blinkTimer: ReturnType<typeof setTimeout> | undefined
    let sleepTimer: ReturnType<typeof setTimeout> | undefined
    let burstTimer: ReturnType<typeof setTimeout> | undefined
    let typingTimer: ReturnType<typeof setTimeout> | undefined
    let frame = 0

    const paint = () => {
      el.dataset.e = resolveExpression(s)
    }
    const burst = (expression: Expression, ms = BURST_MS) => {
      clearTimeout(burstTimer)
      s.burst = expression
      paint()
      burstTimer = setTimeout(() => {
        s.burst = null
        paint()
      }, ms)
    }
    const scheduleBlink = () => {
      blinkTimer = setTimeout(
        () => {
          s.blink = true
          paint()
          blinkTimer = setTimeout(() => {
            s.blink = false
            paint()
            scheduleBlink()
          }, BLINK_MS)
        },
        2800 + Math.random() * 2600,
      )
    }
    const rest = () => {
      clearTimeout(sleepTimer)
      sleepTimer = setTimeout(() => {
        s.sleepy = true
        paint()
      }, IDLE_MS)
    }
    const wake = () => {
      if (s.sleepy) {
        s.sleepy = false
        burst('wow', 500)
      }
      rest()
    }
    /** Turns the face toward a point on the screen, at most 7 units sideways and 6 down. */
    const look = (x: number, y: number) => {
      const box = el.getBoundingClientRect()
      const reach = box.width * 1.4 + 1
      const dx = clamp((x - (box.left + box.width / 2)) / reach, -1, 1)
      const dy = clamp((y - (box.top + box.height / 2)) / reach, -1, 1)
      faceEl.style.transform = `translate(${(dx * 7).toFixed(1)}px, ${(dy * 6).toFixed(1)}px)`
    }
    const onPointerMove = (event: PointerEvent) => {
      wake()
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        look(event.clientX, event.clientY)
      })
    }
    const onKeyDown = () => {
      wake()
      s.attentive = true
      paint()
      clearTimeout(typingTimer)
      typingTimer = setTimeout(() => {
        s.attentive = false
        paint()
      }, 1200)
      const field = document.activeElement
      if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
        const box = field.getBoundingClientRect()
        look(box.left + Math.min(box.width * 0.2, 80), box.top + box.height / 2)
      }
    }
    const onEnter = () => {
      s.attentive = true
      paint()
    }
    const onLeave = () => {
      s.attentive = false
      paint()
    }
    const bounce = () => {
      el.classList.remove('is-bounce')
      void el.getBoundingClientRect()
      el.classList.add('is-bounce')
    }
    const onClick = () => {
      wake()
      burst('happy')
      bounce()
    }
    const onBounceEnd = () => el.classList.remove('is-bounce')
    cheer.current = () => {
      burst('happy', 1200)
      bounce()
    }

    el.classList.add('is-live')
    addEventListener('pointermove', onPointerMove, { passive: true })
    addEventListener('keydown', onKeyDown, { passive: true })
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('click', onClick)
    el.addEventListener('animationend', onBounceEnd)
    scheduleBlink()
    rest()
    return () => {
      cheer.current = null
      el.classList.remove('is-live', 'is-bounce')
      removeEventListener('pointermove', onPointerMove)
      removeEventListener('keydown', onKeyDown)
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('click', onClick)
      el.removeEventListener('animationend', onBounceEnd)
      clearTimeout(blinkTimer)
      clearTimeout(sleepTimer)
      clearTimeout(burstTimer)
      clearTimeout(typingTimer)
      cancelAnimationFrame(frame)
    }
  }, [live])

  const body =
    'M80 42 C104 38 136 38 160 42 C190 47 200 66 201 94 L202 150 C201 180 188 198 160 200 L80 201 C52 201 39 186 38 156 L38 92 C39 64 50 47 80 42 Z'
  const eye = `url(#${id}-eye)`
  const mouth = `url(#${id}-mouth)`
  const ink = '#1e1b4b'

  return (
    <svg
      ref={svg}
      className={`sigap-mascot ${className}`}
      viewBox="0 0 240 240"
      width={size}
      height={size}
      data-e={MOOD_EXPRESSION[mood]}
      data-mood={mood}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-body`} x1=".04" y1="0" x2=".97" y2="1">
          <stop stopColor="#d6d1ff" />
          <stop offset=".25" stopColor="#a197ff" />
          <stop offset=".65" stopColor="#6558f5" />
          <stop offset="1" stopColor="#4b3fd6" />
        </linearGradient>
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" stopOpacity=".4" />
          <stop offset=".48" stopColor="#fff" stopOpacity=".04" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-eye`} x1="0" y1="0" x2=".4" y2="1">
          <stop stopColor={ink} />
          <stop offset="1" stopColor="#13113a" />
        </linearGradient>
        <linearGradient id={`${id}-mouth`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={ink} />
          <stop offset="1" stopColor="#2a2566" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="214" rx="56" ry="7" fill="#6558f5" opacity=".22" />
      <path d={body} fill={`url(#${id}-body)`} stroke="#cfc8ff" strokeOpacity=".6" strokeWidth="1.6" />
      <path d={body} fill={`url(#${id}-gloss)`} />
      <g ref={face} className="face">
        <g className="fx f-open">
          <ellipse cx="96" cy="118" rx="12" ry="19" fill={eye} />
          <ellipse cx="94" cy="108" rx="4.6" ry="6.8" fill="#fff" />
          <ellipse cx="148" cy="118" rx="12" ry="19" fill={eye} />
          <ellipse cx="146" cy="108" rx="4.6" ry="6.8" fill="#fff" />
        </g>
        <g className="fx f-up" stroke={ink} strokeWidth="7.8" strokeLinecap="round" fill="none">
          <path d="M83 123 Q95 105 109 122" />
          <path d="M135 122 Q148 106 161 122" />
        </g>
        <g className="fx f-down" stroke={ink} strokeWidth="7.8" strokeLinecap="round" fill="none">
          <path d="M83 122 Q95 137 109 122" />
          <path d="M134 122 Q148 137 161 122" />
        </g>
        <g className="fx f-wink">
          <ellipse cx="96" cy="118" rx="12" ry="19" fill={eye} />
          <ellipse cx="94" cy="108" rx="4.6" ry="6.8" fill="#fff" />
          <path d="M135 122 Q148 106 161 122" stroke={ink} strokeWidth="7.8" strokeLinecap="round" fill="none" />
        </g>
        <path className="fx f-smile" d="M111 151 Q122 158 133 151" fill="none" stroke={ink} strokeLinecap="round" strokeWidth="5" />
        <g className="fx f-happy">
          <path d="M109 148 Q124 187 144 148 Z" fill={mouth} />
          <path d="M118 165 Q126 161 136 167 Q130 176 124 175 Z" fill="#c7bfff" />
        </g>
        <ellipse className="fx f-o" cx="122" cy="152" rx="8.5" ry="12" fill={mouth} />
      </g>
    </svg>
  )
}
