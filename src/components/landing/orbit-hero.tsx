'use client'

import { useTranslations } from 'next-intl'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowUpRight, Pause, Play, ShieldCheck } from 'lucide-react'
import { InstagramFillIcon, MetaFillIcon, ThreadsFillIcon } from '@/components/brand-icons'
import { names } from './homepage-story'
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

export function OrbitHero({ paused, reduceMotion, onTogglePause }: { paused: boolean; reduceMotion: boolean; onTogglePause: () => void }) {
  const t = useTranslations('landing')
  const ref = useRef<HTMLElement>(null)
  const [offscreen, setOffscreen] = useState(false)
  const [hidden, setHidden] = useState(false)
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
    return () => { observer.disconnect(); resize.disconnect(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
  const reason = reduceMotion ? 'reduced' : paused ? 'user' : hidden ? 'hidden' : offscreen ? 'offscreen' : 'running'
  const stopped = reason !== 'running'
  const label = reduceMotion ? t('footer.reducedMotion') : paused ? t('footer.enableMotion') : t('footer.pauseMotion')
  return <section ref={ref} id="fitur" data-orbit-hero className={styles.hero} aria-labelledby="hero-title">
    <div className={styles.stage} data-orbit-stage data-paused={stopped} data-pause-reason={reason}>
      <div className={styles.camera} data-orbit-camera aria-hidden="true">
        {rings.map(ring => <div key={ring.id} className={`${styles.ring} ${styles[ring.id]}`} data-orbit-ring={ring.id}>
          {ring.covers.map((name, slot) => <span key={name} className={styles.card} data-orbit-card style={{ '--a': `${slot * step + ring.offset}deg` } as CSSProperties}>
            <Image src={`/covers/${name}.webp`} alt="" width={1122} height={1402} sizes="320px" loading="eager" fetchPriority={name === names[0] ? 'high' : undefined} unoptimized draggable={false} />
          </span>)}
        </div>)}
      </div>
    </div>
    <div className={styles.copy} data-orbit-copy>
      <div className={styles.badge} data-orbit-badge>
        <ShieldCheck className={styles.shield} size={16} strokeWidth={2.2} aria-hidden="true" />
        <span>{t('story.opening.apiBadge')}</span>
        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.brands}>
          {platforms.map(({ name, Icon }, index) => <span key={name} className={styles.brand}><Icon size={15} /><span className={styles.srOnly}>{index ? `, ${name}` : `: ${name}`}</span></span>)}
        </span>
      </div>
      <h1 id="hero-title">{t('story.opening.title1')}<br /><span>{t('story.opening.title2')}</span></h1>
      <p>{t('story.opening.body')}</p>
      <div className={styles.actions}>
        <Link href="/daftar" className={styles.primary}>{t('story.start')} <ArrowUpRight size={18} aria-hidden="true" /></Link>
        <a href="#konten" className={styles.secondary}>{t('story.orbit.showcase')}</a>
      </div>
    </div>
    {/* System reduced motion always wins, so the local toggle would do nothing: disable it and say why. */}
    <button type="button" className={styles.toggle} data-orbit-toggle disabled={reduceMotion} aria-pressed={reduceMotion ? undefined : paused} aria-label={label} title={label} onClick={onTogglePause}>
      {paused && !reduceMotion ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
    </button>
  </section>
}
