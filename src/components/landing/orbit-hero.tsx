'use client'

import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { InstagramFillIcon, MetaFillIcon, ThreadsFillIcon } from '@/components/brand-icons'
import { names } from './homepage-story'
import { handleIssue, trialHref } from './instagram-handle'
import styles from './orbit-hero.module.css'

// Brand names are proper nouns, so they stay untranslated; screen readers hear
// them after the badge label because the marks themselves are aria-hidden.
const platforms = [
  { name: 'Meta', Icon: MetaFillIcon },
  { name: 'Instagram', Icon: InstagramFillIcon },
  { name: 'Threads', Icon: ThreadsFillIcon },
] as const

// Two concentric rings, alternating covers between them. The outer ring is
// staggered by half a step so its cards sit in the inner ring's gaps. Both
// drift together very slowly (CSS); React only flips the play state.
const step = 360 / Math.ceil(names.length / 2)
const rings = [
  { id: 'inner', offset: 0, covers: names.filter((_, index) => index % 2 === 0) },
  { id: 'outer', offset: step / 2, covers: names.filter((_, index) => index % 2 === 1) },
] as const

export function OrbitHero({ paused, reduceMotion }: { paused: boolean; reduceMotion: boolean }) {
  const t = useTranslations('landing')
  const opening = useTranslations('landing.story.opening')
  const trial = useTranslations('landing.trial')
  const router = useRouter()
  const noteId = useId()
  const ref = useRef<HTMLElement>(null)
  const [offscreen, setOffscreen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting))
    observer.observe(node)
    const onVisibility = () => setHidden(document.visibilityState === 'hidden')
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    // Smallest radius whose ring never enters the copy box (plus breathing room),
    // measured once per resize so long translations stay clear at every angle.
    const copy = node.querySelector<HTMLElement>('[data-orbit-copy]')
    const card = node.querySelector<HTMLElement>('[data-orbit-card]')
    const fit = () => {
      if (!copy || !card || getComputedStyle(copy).position !== 'absolute') { node.style.removeProperty('--fit-r'); return }
      const gap = 40
      const a = copy.offsetWidth / 2 + card.offsetWidth / 2 + gap
      const b = copy.offsetHeight / 2 + card.offsetHeight / 2 + gap
      node.style.setProperty('--fit-r', `${Math.ceil(Math.max(Math.hypot(a, b), card.offsetWidth * 3.3))}px`)
    }
    const resize = new ResizeObserver(fit)
    if (copy) resize.observe(copy)
    resize.observe(node)
    fit()
    const pending = timers.current
    return () => { observer.disconnect(); resize.disconnect(); document.removeEventListener('visibilitychange', onVisibility); pending.forEach(clearTimeout) }
  }, [])
  const reason = reduceMotion ? 'reduced' : paused ? 'user' : hidden ? 'hidden' : offscreen ? 'offscreen' : 'running'
  const stopped = reason !== 'running'
  const motion = !reduceMotion && !paused
  // The entrance (blur step-in, covers fading in) keys off reduced motion only, so pausing and
  // resuming the page never replays it.
  const issue = handleIssue(value)
  const error = touched && issue ? trial(issue === 'space' ? 'handleSpace' : 'handleInvalid') : null
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (issue || submitting) return
    const href = trialHref(value)
    if (!motion) { router.push(href); return }
    setSubmitting(true)
    timers.current.push(setTimeout(() => setConfetti(true), 450))
    timers.current.push(setTimeout(() => router.push(href), 1100))
  }
  return <section ref={ref} id="fitur" data-orbit-hero data-motion={!reduceMotion} className={styles.hero} aria-labelledby="hero-title"
    data-tour-stop="hello" data-tour-grow data-tour-anchor="[data-orbit-badge]" data-tour-side="right" data-tour-face="happy" data-tour-fx="elastic" data-tour-say={t('featureTour.hello')}>
    <div className={styles.stage} data-orbit-stage data-paused={stopped} data-pause-reason={reason}>
      <div className={styles.camera} data-orbit-camera aria-hidden="true">
        {rings.map(ring => <div key={ring.id} className={`${styles.ring} ${styles[ring.id]}`} data-orbit-ring={ring.id}>
          {ring.covers.map((name, slot) => <span key={name} className={styles.card} data-orbit-card style={{ '--a': `${slot * step + ring.offset}deg`, '--i': slot } as CSSProperties}>
            <span className={styles.frame}>
              <Image src={`/covers/${name}.webp`} alt="" width={1122} height={1402} sizes="320px" loading="eager" fetchPriority={name === names[0] ? 'high' : undefined} unoptimized draggable={false} />
            </span>
          </span>)}
        </div>)}
      </div>
    </div>
    <div className={styles.copy} data-orbit-copy>
      <div className={`${styles.badge} ${styles.step}`} data-orbit-badge>
        <ShieldCheck className={styles.shield} size={16} strokeWidth={2.2} aria-hidden="true" />
        <span>{opening('apiBadge')}</span>
        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.brands}>
          {platforms.map(({ name, Icon }, index) => <span key={name} className={styles.brand}><Icon size={15} /><span className={styles.srOnly}>{index ? `, ${name}` : `: ${name}`}</span></span>)}
        </span>
      </div>
      <h1 id="hero-title" className={styles.step}>
        {opening('title1')}<br />
        <span className={styles.titleLine}>{opening('title2')}</span>
      </h1>
      <p className={`${styles.subtitle} ${styles.step}`}>{opening('subtitle')}</p>
      <p className={`${styles.body} ${styles.step}`}>{opening('body')}</p>
      <form className={`${styles.form} ${styles.step}`} onSubmit={submit} noValidate data-orbit-trial>
        <div className={styles.field}>
          <input type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={100}
            value={value} onChange={event => setValue(event.target.value)} onBlur={() => setTouched(true)}
            placeholder={trial('placeholder')} aria-label={trial('label')} aria-invalid={!!error || undefined} aria-describedby={noteId} />
          <InstagramFillIcon className={styles.ig} size={18} aria-hidden="true" />
        </div>
        <button type="submit" className={styles.cta} disabled={submitting} aria-busy={submitting}>
          {submitting && <span className={styles.spinner} aria-hidden="true" />}{submitting ? trial('submitting') : trial('cta')}
        </button>
      </form>
      {/* The validation hint's line. Its height is reserved in CSS so a hint never resizes the copy box
          (which would re-fit and jump the ring). */}
      <p id={noteId} className={`${styles.note} ${styles.step}`} data-error={!!error || undefined} role="status">{error ?? t('cta.note')}</p>
    </div>
    {confetti && <div className={styles.confetti} aria-hidden="true">{Array.from({ length: 16 }, (_, i) =>
      <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${(i % 6) * 0.06}s`, '--c': ['#6558f5', '#302650', '#3fe0b5', '#ffb86b'][i % 4] } as CSSProperties} />)}</div>}
  </section>
}
