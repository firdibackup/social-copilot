'use client'

import { useEffect, useId, useRef } from 'react'
import {
  MOOD_EXPRESSION,
  resolveFace,
  MIMO_FIELD_ATTR,
  MIMO_SENT_EVENT,
  typingExpression,
  type Expression,
  type MascotState,
  type Mood,
} from '@/lib/mascot-expression'

interface MimoMascotProps {
  size?: number
  /** What Mimo is doing; the mascot adds blinks, sleep and reactions on top. */
  mood?: Mood
  /** Change the number to make the mascot cheer: a bounce and a happy face. */
  pulse?: number
  /** A still face, no timers or pointer tracking: for the small marks beside messages. */
  still?: boolean
  /**
   * React to what is typed in the Mimo composer (the field marked `data-mimo-field`) instead of any key on the page:
   * listening, wondering at questions, cheering at "!", worrying at erasing, and a happy bounce when the message goes.
   */
  composer?: boolean
  className?: string
}

const IDLE_MS = 12_000
const BURST_MS = 900
const BLINK_MS = 130
/** How long a typing face stays after the last change. */
const TYPING_HOLD_MS = 1800
/** How long the mouth keeps chattering after a keystroke. */
const CHATTER_MS = 380

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Mimo's mascot: one SVG with every face drawn, `data-e` picks the expression and `data-blink` shuts the eyes (CSS in
 * globals.css). A live one blinks, looks at the pointer and at the field being typed in, reacts to what is typed, falls
 * asleep after a while and cheers when clicked. Timers write to the DOM directly, so no render runs per keystroke.
 */
export function MimoMascot({ size = 96, mood = 'idle', pulse = 0, still = false, composer = false, className = '' }: MimoMascotProps) {
  const id = useId()
  const svg = useRef<SVGSVGElement>(null)
  const face = useRef<SVGGElement>(null)
  const state = useRef<MascotState>({ mood, burst: null, blink: false, sleepy: false, attentive: false, typing: null })
  const cheer = useRef<(() => void) | null>(null)
  const live = !still

  useEffect(() => {
    const el = svg.current
    state.current.mood = mood
    if (el) paintFace(el, state.current)
  }, [mood])

  useEffect(() => {
    if (pulse > 0) cheer.current?.()
  }, [pulse])

  useEffect(() => {
    const el = svg.current
    const faceEl = face.current
    if (!live || !el || !faceEl) return
    const s = state.current
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let blinkTimer: ReturnType<typeof setTimeout> | undefined
    let sleepTimer: ReturnType<typeof setTimeout> | undefined
    let burstTimer: ReturnType<typeof setTimeout> | undefined
    let typingTimer: ReturnType<typeof setTimeout> | undefined
    let chatterTimer: ReturnType<typeof setTimeout> | undefined
    let frame = 0
    let erasing = 0

    const paint = () => paintFace(el, s)
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
    /** Looks roughly where the text ends, so the eyes follow along as the line grows. */
    const lookAtField = (field: HTMLTextAreaElement | HTMLInputElement) => {
      const box = field.getBoundingClientRect()
      const line = field.value.slice(field.value.lastIndexOf('\n') + 1).length
      look(box.left + clamp(12 + line * 7, 12, box.width - 12), box.top + box.height / 2)
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
      if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) lookAtField(field)
    }
    const isComposerField = (target: EventTarget | null): target is HTMLTextAreaElement | HTMLInputElement =>
      (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) && target.hasAttribute(MIMO_FIELD_ATTR)
    const settle = () => {
      clearTimeout(typingTimer)
      clearTimeout(chatterTimer)
      el.classList.remove('is-chatter')
      erasing = 0
      s.typing = null
    }
    const onInput = (event: Event) => {
      const field = event.target
      if (!isComposerField(field)) return
      wake()
      const kind = event instanceof InputEvent ? event.inputType : ''
      erasing = kind.startsWith('delete') ? erasing + 1 : 0
      s.typing = typingExpression({ text: field.value, erasing, pasted: kind === 'insertFromPaste' })
      paint()
      lookAtField(field)
      if (!reduced) {
        el.classList.add('is-chatter')
        clearTimeout(chatterTimer)
        chatterTimer = setTimeout(() => el.classList.remove('is-chatter'), CHATTER_MS)
      }
      clearTimeout(typingTimer)
      typingTimer = setTimeout(() => {
        erasing = 0
        s.typing = null
        paint()
      }, TYPING_HOLD_MS)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!isComposerField(event.target)) return
      wake()
      s.attentive = true
      paint()
      lookAtField(event.target)
    }
    const onFocusOut = (event: FocusEvent) => {
      if (!isComposerField(event.target)) return
      s.attentive = false
      settle()
      paint()
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
    const onBounceEnd = (event: AnimationEvent) => {
      if (event.animationName === 'mascot-bounce') el.classList.remove('is-bounce')
    }
    cheer.current = () => {
      burst('happy', 1200)
      bounce()
    }
    const onSent = () => {
      wake()
      settle()
      cheer.current?.()
    }

    el.classList.add('is-live')
    addEventListener('pointermove', onPointerMove, { passive: true })
    if (composer) {
      document.addEventListener('input', onInput, true)
      document.addEventListener('focusin', onFocusIn)
      document.addEventListener('focusout', onFocusOut)
      addEventListener(MIMO_SENT_EVENT, onSent)
    } else {
      addEventListener('keydown', onKeyDown, { passive: true })
    }
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('click', onClick)
    el.addEventListener('animationend', onBounceEnd)
    scheduleBlink()
    rest()
    return () => {
      cheer.current = null
      el.classList.remove('is-live', 'is-bounce', 'is-chatter')
      removeEventListener('pointermove', onPointerMove)
      removeEventListener('keydown', onKeyDown)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      removeEventListener(MIMO_SENT_EVENT, onSent)
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('click', onClick)
      el.removeEventListener('animationend', onBounceEnd)
      clearTimeout(blinkTimer)
      clearTimeout(sleepTimer)
      clearTimeout(burstTimer)
      clearTimeout(typingTimer)
      clearTimeout(chatterTimer)
      cancelAnimationFrame(frame)
      s.typing = null
      s.blink = false
    }
  }, [live, composer])

  const body =
    'M80 42 C104 38 136 38 160 42 C190 47 200 66 201 94 L202 150 C201 180 188 198 160 200 L80 201 C52 201 39 186 38 156 L38 92 C39 64 50 47 80 42 Z'
  const eye = `url(#${id}-eye)`
  const mouth = `url(#${id}-mouth)`
  const ink = '#1e1b4b'
  const line = { stroke: ink, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const
  const spark = 'M0 -13 Q2 -2 13 0 Q2 2 0 13 Q-2 2 -13 0 Q-2 -2 0 -13 Z'

  return (
    <svg
      ref={svg}
      className={`mimo-mascot ${className}`}
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
        {/* Cheeks */}
        <g className="fx k-blush" fill="#ff8fc0">
          <ellipse cx="76" cy="146" rx="12" ry="6.5" />
          <ellipse cx="168" cy="146" rx="12" ry="6.5" />
        </g>

        {/* Eyes: a blink (data-blink) hides these and shows f-shut. */}
        <g className="eyes">
          <g className="fx f-open">
            <ellipse cx="96" cy="118" rx="12" ry="19" fill={eye} />
            <ellipse cx="94" cy="108" rx="4.6" ry="6.8" fill="#fff" />
            <ellipse cx="148" cy="118" rx="12" ry="19" fill={eye} />
            <ellipse cx="146" cy="108" rx="4.6" ry="6.8" fill="#fff" />
          </g>
          <g className="fx f-up" {...line} strokeWidth="7.8">
            <path d="M83 123 Q95 105 109 122" />
            <path d="M135 122 Q148 106 161 122" />
          </g>
          <g className="fx f-down" {...line} strokeWidth="7.8">
            <path d="M83 122 Q95 137 109 122" />
            <path d="M134 122 Q148 137 161 122" />
          </g>
          <g className="fx f-wink">
            <ellipse cx="96" cy="118" rx="12" ry="19" fill={eye} />
            <ellipse cx="94" cy="108" rx="4.6" ry="6.8" fill="#fff" />
            <path d="M135 122 Q148 106 161 122" {...line} strokeWidth="7.8" />
          </g>
          <g className="fx f-hmm">
            <ellipse cx="96" cy="116" rx="12" ry="20" fill={eye} />
            <ellipse cx="94" cy="106" rx="4.6" ry="6.8" fill="#fff" />
            <ellipse cx="148" cy="124" rx="12" ry="10" fill={eye} />
            <ellipse cx="146" cy="120" rx="3.6" ry="3.4" fill="#fff" />
          </g>
          <g className="fx f-shut" {...line} strokeWidth="7">
            <path d="M84 120 Q96 128 108 120" />
            <path d="M136 120 Q148 128 160 120" />
          </g>
        </g>

        {/* Brows */}
        <g className="fx b-up" {...line} strokeWidth="5.5">
          <path d="M84 88 Q96 79 108 86" />
          <path d="M136 86 Q148 79 160 88" />
        </g>
        <g className="fx b-hmm" {...line} strokeWidth="5.5">
          <path d="M83 84 Q95 72 108 80" />
          <path d="M135 103 Q148 99 161 104" />
        </g>
        <g className="fx b-worry" {...line} strokeWidth="5.5">
          <path d="M83 94 Q96 93 107 84" />
          <path d="M137 84 Q148 93 161 94" />
        </g>

        {/* Mouths: every expression shows one. */}
        <path className="fx m-soft" d="M113 152 Q122 157.5 131 152" {...line} strokeWidth="5" />
        <path className="fx f-smile" d="M111 151 Q122 159 133 151" {...line} strokeWidth="5" />
        <g className="fx f-happy">
          <path d="M109 148 Q124 187 144 148 Z" fill={mouth} />
          <path d="M118 165 Q126 161 136 167 Q130 176 124 175 Z" fill="#ff9ec7" />
        </g>
        <ellipse className="fx f-o" cx="122" cy="152" rx="8.5" ry="12" fill={mouth} />
        <g className="fx m-chat">
          <ellipse className="m-chat-jaw" cx="122" cy="153" rx="9" ry="7.5" fill={mouth} />
        </g>
        <path className="fx m-hmm" d="M111 157 Q121 153 135 148" {...line} strokeWidth="5" />
        <path className="fx m-wave" d="M107 156 Q111.5 149 116 155 T125 155 T134 155" {...line} strokeWidth="4.6" />
        <path className="fx m-cat" d="M108 150 Q114.5 159 121 151 Q127.5 159 134 150" {...line} strokeWidth="4.6" />

        {/* Little extras around the face */}
        <path className="fx x x-sweat" d="M176 70 Q167 85 170 91 Q174 98 181 92 Q185 85 176 70 Z" fill="#cdeeff" stroke="#6cbbe9" strokeWidth="2" />
      </g>
      <g className="fx x x-q">
        <circle cx="206" cy="40" r="17" fill="#fff" stroke="#cfc8ff" strokeWidth="2" />
        <text x="206" y="49" textAnchor="middle" fontSize="26" fontWeight="800" fill="#6558f5" fontFamily="system-ui, sans-serif">
          ?
        </text>
      </g>
      <g className="fx x x-spark" fill="#ffc94d" stroke="#f0a92b" strokeWidth="1.5" strokeLinejoin="round">
        <path d={spark} transform="translate(208 44)" />
        <path d={spark} transform="translate(30 62) scale(.65)" />
        <path d={spark} transform="translate(218 92) scale(.5)" />
      </g>
      <g className="fx x x-z" fill="#8f84ff" fontWeight="800" fontFamily="system-ui, sans-serif">
        <text x="190" y="52" fontSize="30">
          z
        </text>
        <text x="212" y="28" fontSize="20">
          z
        </text>
      </g>
    </svg>
  )
}

/** Writes the face to the SVG, outside React. */
function paintFace(el: SVGSVGElement, state: MascotState) {
  const { expression, blink } = resolveFace(state)
  el.dataset.e = expression
  el.toggleAttribute('data-blink', blink)
}
