'use client'

import { useTranslations } from 'next-intl'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import styles from './onboarding-hero.module.css'

const WORDS = 6
const MORPH_S = 0.8
const COOLDOWN_S = 1.7 // + morph = ±2.5s per word
const HANDLE = /^[A-Za-z0-9._]{1,30}$/

/** '@Kopi.Kita ' → 'Kopi.Kita'. Empty string means "no handle". */
export function normalizeHandle(value: string) {
  return value.trim().replace(/^@+/, '')
}

export function handleIssue(value: string): 'space' | 'invalid' | null {
  const handle = normalizeHandle(value)
  if (!handle) return null
  if (/\s/.test(handle)) return 'space'
  return HANDLE.test(handle) ? null : 'invalid'
}

const lerp = (from: number, to: number, f: number) => from + (to - from) * f

/* ---------- B) Gooey morph word (SVG threshold + rAF blur/opacity) ---------- */
function MorphWord({ words, animate, crossfade }: { words: string[]; animate: boolean; crossfade: boolean }) {
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
    return () => cancelAnimationFrame(raf)
  }, [list, animate, crossfade])
  return <span ref={wrap} className={styles.morph} data-gooey={animate && !crossfade}>
    <span ref={a} aria-hidden="true" style={{ opacity: 0 }} />
    <span ref={b} aria-hidden="true">{words[0]}</span>
  </span>
}

/* ---------- A/D) CSS 3D iridescent asterisk (Three.js is not installed) ---------- */
function Asterisk({ animate }: { animate: boolean }) {
  const star = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = star.current
    if (!el || !animate) return
    const start = performance.now()
    const mouse = { x: 0, y: 0 }, tilt = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5 }
    addEventListener('pointermove', onMove)
    let raf = 0
    const frame = (now: number) => {
      const t = (now - start) / 1000
      const entry = 1 - Math.pow(1 - Math.min(1, t), 3) // 1s ease-out
      tilt.x = lerp(tilt.x, mouse.y * -24, 0.08)
      tilt.y = lerp(tilt.y, mouse.x * 30, 0.08)
      const spin = t * 22.9 - 180 * (1 - entry) // 0.4 rad/s + extra half turn on entry
      el.style.transform = `scale(${0.6 + 0.4 * entry}) rotateX(${tilt.x}deg) rotateY(${spin + tilt.y}deg)`
      el.style.setProperty('--sheen', `${(t * 40) % 360}deg`)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', onMove) }
  }, [animate])
  return <div className={`${styles.logo} ${styles.step}`} aria-hidden="true">
    <div ref={star} className={styles.star}>
      <span className={styles.starDepth} />
      <span className={styles.starBase} />
      <span className={styles.starSheen} />
    </div>
  </div>
}

/* ---------- C) Floating cover cards with mouse parallax ---------- */
function FloatingCards({ animate }: { animate: boolean }) {
  const t = useTranslations('landing.story')
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!animate) return
    const mouse = { x: 0, y: 0 }, cur = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => { mouse.x = (e.clientX / innerWidth - 0.5) * 2; mouse.y = (e.clientY / innerHeight - 0.5) * 2 }
    addEventListener('pointermove', onMove)
    let raf = 0
    const frame = () => {
      cur.x = lerp(cur.x, mouse.x, 0.08)
      cur.y = lerp(cur.y, mouse.y, 0.08)
      const shift = `translate(${cur.x * 12}px, ${cur.y * 12}px) rotate(${cur.x * 3}deg)`
      if (left.current) left.current.style.transform = shift
      if (right.current) right.current.style.transform = shift
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', onMove) }
  }, [animate])
  const cards = [
    { side: styles.cardLeft, ref: left, src: '/covers/01-beauty-skincare.webp', label: t('covers.label0') },
    { side: styles.cardRight, ref: right, src: '/covers/03-cafe.webp', label: t('covers.label2') },
  ]
  return <>{cards.map(({ side, ref, src, label }) => <div key={src} className={`${styles.cardSlot} ${side}`}>
    <div className={styles.cardFloat}><div ref={ref}><div className={styles.cardTilt}>
      <Image src={src} alt={t('covers.alt', { category: label })} width={1122} height={1402} sizes="220px" unoptimized priority />
    </div></div></div>
  </div>)}</>
}

/* ---------- Hero ---------- */
export function OnboardingHero({ motionEnabled, crossfade }: { motionEnabled: boolean; crossfade: boolean }) {
  const t = useTranslations('landing.onboarding')
  const router = useRouter()
  const noteId = useId()
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [touched, setTouched] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => { const pending = timers.current; return () => pending.forEach(clearTimeout) }, [])
  const words = Array.from({ length: WORDS }, (_, i) => t(`word${i}`))
  const issue = handleIssue(value)
  const note = touched && issue ? t(issue === 'space' ? 'handleSpace' : 'handleInvalid') : null
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (issue || submitting) return
    const handle = normalizeHandle(value)
    const href = handle ? `/daftar?instagram=${encodeURIComponent(handle)}` : '/daftar'
    if (!motionEnabled) { router.push(href); return }
    setSubmitting(true)
    timers.current.push(setTimeout(() => setConfetti(true), 450))
    timers.current.push(setTimeout(() => router.push(href), 1100))
  }
  return <section className={styles.hero} data-motion={motionEnabled} aria-labelledby="onboarding-title">
    <svg className={styles.filters} aria-hidden="true" focusable="false">
      <filter id="carousely-threshold">
        <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -9" />
        <feComposite in2="SourceGraphic" operator="atop" />
      </filter>
    </svg>
    <FloatingCards animate={motionEnabled} />
    <div className={styles.content}>
      <Asterisk animate={motionEnabled} />
      <h1 id="onboarding-title" className={styles.step}>
        {t('title1')}<br />
        <span className={styles.titleLine}>{t('title2')} <MorphWord words={words} animate={motionEnabled} crossfade={crossfade} /></span>
        <span className={styles.srOnly}>{words.join(', ')}</span>
      </h1>
      <p className={`${styles.sub} ${styles.step}`}>{t('body')}</p>
      <form className={`${styles.form} ${styles.step}`} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <input type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={100}
            value={value} onChange={e => setValue(e.target.value)} onBlur={() => setTouched(true)}
            placeholder={t('placeholder')} aria-label={t('placeholder')} aria-invalid={!!note || undefined} aria-describedby={note ? noteId : undefined} />
          <svg className={styles.ig} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3.1" y="3.1" width="17.8" height="17.8" rx="5.2" strokeWidth="1.7" /><circle cx="12" cy="12" r="4.1" strokeWidth="1.7" /><circle cx="17.1" cy="6.9" r="1.15" fill="currentColor" stroke="none" /></svg>
        </div>
        <button type="submit" className={styles.cta} disabled={submitting} aria-busy={submitting}>
          {submitting && <span className={styles.spinner} aria-hidden="true" />}{submitting ? t('submitting') : t('cta')}
        </button>
      </form>
      {note && <p id={noteId} className={styles.error} role="status">{note}</p>}
      <p className={`${styles.note} ${styles.step}`}>{t('note')}</p>
      <Link href="/masuk" className={`${styles.login} ${styles.step}`}>{t('login')}</Link>
    </div>
    {confetti && <div className={styles.confetti} aria-hidden="true">{Array.from({ length: 16 }, (_, i) =>
      <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${(i % 6) * 0.06}s`, '--c': ['#6558f5', '#0a0a0a', '#3fe0b5', '#ffb86b'][i % 4] } as CSSProperties} />)}</div>}
  </section>
}
