'use client'

import { useEffect, useRef } from 'react'
import styles from './morph-word.module.css'

const MORPH_S = 0.8
const COOLDOWN_S = 1.7 // + morph = ±2.5s per word

/** Alpha threshold that melts the two blurred words into one gooey shape. Render once, beside the MorphWord. */
export function GooeyFilter() {
  return <svg className={styles.filters} aria-hidden="true" focusable="false">
    <filter id="carousely-threshold">
      <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -9" />
      <feComposite in2="SourceGraphic" operator="atop" />
    </filter>
  </svg>
}

/** Rotating word with a gooey blur morph driven by rAF; `crossfade` swaps the morph for a plain fade (reduced motion). */
export function MorphWord({ words, animate, crossfade }: { words: string[]; animate: boolean; crossfade: boolean }) {
  const list = words.join('\n')
  const wrap = useRef<HTMLSpanElement>(null)
  const a = useRef<HTMLSpanElement>(null)
  const b = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const words = list.split('\n')
    const [w, oldEl, newEl] = [wrap.current, a.current, b.current]
    if (!w || !oldEl || !newEl || (!animate && !crossfade)) return
    let index = 0, morph = 0, cooldown = COOLDOWN_S, last = performance.now(), raf = 0
    const fit = () => { w.style.width = `${newEl.offsetWidth}px` }
    const paint = (el: HTMLSpanElement, fraction: number) => {
      el.style.filter = crossfade || fraction >= 1 ? '' : `blur(${Math.min(8 / fraction - 8, 100)}px)`
      el.style.opacity = `${(crossfade ? fraction : Math.pow(fraction, 0.4)) * 100}%`
    }
    const setText = () => {
      oldEl.textContent = words[index % words.length]
      newEl.textContent = words[(index + 1) % words.length]
      fit()
    }
    oldEl.textContent = words[0]
    newEl.textContent = words[0]
    fit()
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const idle = cooldown > 0
      cooldown -= dt
      if (cooldown <= 0) {
        if (idle) { index++; setText() } // a morph starts: old = current word, new = next
        morph -= cooldown
        cooldown = 0
        let fraction = morph / MORPH_S
        if (fraction >= 1) { cooldown = COOLDOWN_S; fraction = 1; morph = 0 }
        paint(newEl, fraction)
        paint(oldEl, 1 - fraction)
      } else {
        newEl.style.filter = ''; newEl.style.opacity = '100%'
        oldEl.style.filter = ''; oldEl.style.opacity = '0%'
      }
      raf = requestAnimationFrame(frame)
    }
    // First cycle shows word 0 statically, then morphs 0 → 1.
    index = -1
    raf = requestAnimationFrame(frame)
    // Stopping mid-morph (pause, offscreen) must not freeze a half-blurred word.
    return () => {
      cancelAnimationFrame(raf)
      newEl.style.filter = ''; newEl.style.opacity = '100%'
      oldEl.style.filter = ''; oldEl.style.opacity = '0%'
    }
  }, [list, animate, crossfade])
  return <span ref={wrap} className={styles.morph} data-gooey={animate && !crossfade}>
    <span ref={a} aria-hidden="true" style={{ opacity: 0 }} />
    <span ref={b} aria-hidden="true">{words[0]}</span>
  </span>
}
