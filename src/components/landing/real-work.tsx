'use client'

import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowRight, BadgeCheck, Bookmark, ChevronLeft, ChevronRight, Heart, MessageCircle, MoreHorizontal, Send } from 'lucide-react'
import { InstagramFillIcon } from '@/components/brand-icons'
import { handleIssue, trialHref } from './instagram-handle'
import styles from './real-work.module.css'

/**
 * Clients whose published carousels we show. Adding one = an entry here, its webp slides in
 * public/showcase/<key>/<slug>-<n>.webp, and `landing.realWork.<key>` copy in both locales.
 */
export const realClients = [
  {
    key: 'remax', name: 'RE/MAX Indonesia', short: 'RE/MAX', ig: { handle: 'remaxindonesia', avatar: '/partners/instagram/remax.jpg' }, logo: { src: '/partners/remax.svg', width: 220, height: 60 },
    carousels: [
      { key: 'costs', slug: 'biaya', count: 5, height: 1125, coverHeight: 1200 },
      { key: 'inspect', slug: 'cek', count: 6, height: 1125 },
      { key: 'steps', slug: 'langkah', count: 6, height: 1187 },
    ],
  },
  {
    key: 'sume', name: 'SUME', short: 'SUME', ig: { handle: 'sume.group', avatar: '/partners/instagram/sume.jpg' }, logo: { src: '/partners/sume.png', width: 1745, height: 431 },
    carousels: [
      { key: 'ups', slug: 'a', count: 6, height: 1125 },
      { key: 'pue', slug: 'b', count: 6, height: 1125 },
    ],
  },
] as const satisfies readonly RealClient[]
type RealCarousel = { key: string; slug: string; count: number; height: number; coverHeight?: number }
type RealClient = { key: string; name: string; short: string; ig: { handle: string; avatar: string }; logo: { src: string; width: number; height: number }; carousels: readonly RealCarousel[] }
type Translate = ReturnType<typeof useTranslations<'landing.realWork'>>
// Client and carousel keys come from the data above; the i18n tests keep both catalogs complete.
const msg = (t: Translate, key: string, values?: Record<string, string | number>) => t(key as Parameters<Translate>[0], values as never)

function PostCarousel({ client, item, motionEnabled, hidden }: { client: RealClient; item: RealCarousel; motionEnabled: boolean; hidden: boolean }) {
  const t = useTranslations('landing.realWork')
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  // Slide a button/arrow key is scrolling to; scroll events in between don't rewrite the counter.
  const pending = useRef<number | null>(null)
  const { key, slug, count, height, coverHeight } = item
  const title = msg(t, `${client.key}.${key}.title`)
  const titleId = `real-${client.key}-${key}`
  const go = (next: number) => {
    const node = track.current
    if (!node) return
    const target = Math.max(0, Math.min(count - 1, next))
    pending.current = motionEnabled ? target : null
    node.scrollTo({ left: target * node.clientWidth, behavior: motionEnabled ? 'smooth' : 'auto' })
    setIndex(target)
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1) }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1) }
  }
  return <article className={styles.post} data-carousel={key} data-hidden={hidden || undefined} aria-labelledby={titleId}>
    {/* Dressed as an Instagram feed post: story-ring avatar, handle, media, action row, caption. */}
    <header className={styles.postHead}>
      <span className={styles.storyRing} aria-hidden="true"><Image src={client.ig.avatar} alt="" width={64} height={64} sizes="34px" unoptimized /></span>
      <span className={styles.igMeta}>
        <a href={`https://www.instagram.com/${client.ig.handle}/`} target="_blank" rel="noopener noreferrer">{client.ig.handle}</a>
        <small>{t('slides', { count })}</small>
      </span>
      <MoreHorizontal className={styles.igMore} size={20} aria-hidden="true" />
    </header>
    <div className={styles.viewport} style={{ aspectRatio: `900 / ${height}` }}>
      <div ref={track} className={styles.track} tabIndex={0} role="group" aria-roledescription="carousel" aria-label={title} onKeyDown={onKey}
        onPointerDown={() => { pending.current = null }} onWheel={() => { pending.current = null }}
        onScroll={event => {
          const node = event.currentTarget
          const position = node.scrollLeft / Math.max(1, node.clientWidth)
          if (pending.current !== null) { if (Math.abs(position - pending.current) < 0.02) pending.current = null; return }
          const next = Math.round(position)
          if (next !== index) setIndex(next)
        }}>
        {Array.from({ length: count }, (_, i) => <div key={i} className={styles.slide} role="group" aria-roledescription="slide" aria-label={t('slideOf', { current: i + 1, total: count })}>
          <Image src={`/showcase/${client.key}/${slug}-${i}.webp`} alt={msg(t, `${client.key}.${key}.alt${i}`)} width={900} height={i === 0 && coverHeight ? coverHeight : height} sizes="(max-width: 767px) 88vw, 340px" unoptimized draggable={false} />
        </div>)}
      </div>
      <button type="button" className={`${styles.nav} ${styles.prev}`} onClick={() => go(index - 1)} disabled={index === 0} aria-label={t('prev')}><ChevronLeft size={18} /></button>
      <button type="button" className={`${styles.nav} ${styles.next}`} onClick={() => go(index + 1)} disabled={index === count - 1} aria-label={t('next')}><ChevronRight size={18} /></button>
    </div>
    <div className={styles.igActions} aria-hidden="true">
      <span><Heart size={23} /><MessageCircle size={23} /><Send size={22} /></span>
      <span className={styles.dots}>{Array.from({ length: count }, (_, i) => <i key={i} data-on={i === index || undefined} />)}</span>
      <Bookmark size={23} />
    </div>
    <div className={styles.caption}><b aria-hidden="true">{client.ig.handle}</b> <h4 id={titleId} className={styles.postTitle}>{title}</h4></div>
  </article>
}

function ClientPanel({ client, motionEnabled, active, direction, next, onNext }: { client: RealClient; motionEnabled: boolean; active: boolean; direction: number; next: RealClient; onNext: () => void }) {
  const t = useTranslations('landing.realWork')
  const [carousel, setCarousel] = useState<string>(client.carousels[0].key)
  return <div id={`real-panel-${client.key}`} role="tabpanel" aria-labelledby={`real-tab-${client.key}`} className={styles.panel} data-client={client.key} data-dir={direction < 0 ? 'back' : 'forward'} hidden={!active}>
    <div className={styles.realHead}>
      <span className={styles.badge}>
        <BadgeCheck size={15} aria-hidden="true" />{t('label')}<span className={styles.badgeDivider} aria-hidden="true" />
        <Image className={styles.badgeLogo} src={client.logo.src} alt={client.name} width={client.logo.width} height={client.logo.height} unoptimized />
      </span>
      <h3>{msg(t, `${client.key}.title`)}</h3>
      <p>{msg(t, `${client.key}.body`)}</p>
    </div>
    {/* Phones show one post at a time (a row of swipeable posts inside swipeable slides is a trap); desktop shows them all. */}
    <div className={styles.chips} role="group" aria-label={t('pick')}>
      {client.carousels.map(({ key, count }) => <button key={key} type="button" aria-pressed={carousel === key} onClick={() => setCarousel(key)}>{msg(t, `${client.key}.${key}.short`)}<small>{count}</small></button>)}
    </div>
    <div className={styles.posts} style={{ '--n': client.carousels.length } as CSSProperties}>
      {client.carousels.map(item => <PostCarousel key={item.key} client={client} item={item} motionEnabled={motionEnabled} hidden={item.key !== carousel} />)}
    </div>
    {next.key !== client.key && <button type="button" className={styles.upNext} onClick={onNext}>
      <span>{t('upNext', { name: next.short })}</span>
      <Image className={styles.upNextLogo} src={next.logo.src} alt="" width={next.logo.width} height={next.logo.height} unoptimized />
      <ArrowRight size={16} aria-hidden="true" />
    </button>}
  </div>
}

/** Manual client slideshow: it only moves when the visitor asks. Tabs show who is on screen and that there is more. */
export function RealWork({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing.realWork')
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState(1)
  const root = useRef<HTMLDivElement>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const total = realClients.length
  const show = (target: number, { focus = false, reveal = false } = {}) => {
    const next = (target + total) % total
    setDirection(target >= current ? 1 : -1)
    setCurrent(next)
    if (focus) tabs.current[next]?.focus({ preventScroll: true })
    // Switching from the bottom of a long panel: bring the new client's heading back into view.
    const node = root.current
    if (reveal && node && node.getBoundingClientRect().top < 0) node.scrollIntoView({ behavior: motionEnabled ? 'smooth' : 'auto', block: 'start' })
  }
  const onTabKey = (event: KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: total - 1 }
    if (!(event.key in keys)) return
    event.preventDefault()
    show(keys[event.key], { focus: true })
  }
  return <div ref={root} className={styles.real} data-real-work data-motion={motionEnabled} role="region" aria-label={t('label')}>
    <div className={styles.switcher}>
      <div className={styles.clientTabs} role="tablist" aria-label={t('clients')} onKeyDown={onTabKey}>
        {realClients.map((client, i) => <button key={client.key} ref={node => { tabs.current[i] = node }} id={`real-tab-${client.key}`} type="button" role="tab"
          aria-selected={i === current} aria-controls={`real-panel-${client.key}`} tabIndex={i === current ? 0 : -1} onClick={() => show(i)}>{client.short}</button>)}
      </div>
      <div className={styles.pager}>
        <span className={styles.pagerCount} aria-live="polite"><span className={styles.srOnly}>{t('clientOf', { current: current + 1, total })}</span><span aria-hidden="true">{current + 1}<i>/</i>{total}</span></span>
        <button type="button" onClick={() => show(current - 1)} aria-label={t('prevClient')}><ChevronLeft size={17} /></button>
        <button type="button" onClick={() => show(current + 1)} aria-label={t('nextClient')}><ChevronRight size={17} /></button>
      </div>
    </div>
    {realClients.map((client, i) => <ClientPanel key={client.key} client={client} motionEnabled={motionEnabled} active={i === current} direction={direction}
      next={realClients[(i + 1) % total]} onNext={() => show(i + 1, { focus: true, reveal: true })} />)}
  </div>
}

/** Closing trial prompt for the showcase. Same handle rules and destination as the hero form. */
export function TrialPrompt({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing.trialPrompt')
  const trial = useTranslations('landing.trial')
  const router = useRouter()
  const noteId = useId()
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const issue = handleIssue(value)
  const error = touched && issue ? trial(issue === 'space' ? 'handleSpace' : 'handleInvalid') : null
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (issue || submitting) return
    setSubmitting(true)
    router.push(trialHref(value))
  }
  return <div className={styles.prompt} data-trial-prompt data-motion={motionEnabled}>
    <div className={styles.promptCopy}>
      <h3>{t('title')}</h3>
      <p>{t('body')}</p>
    </div>
    <form className={styles.promptForm} onSubmit={submit} noValidate>
      <label className={styles.promptField}>
        <InstagramFillIcon className={styles.promptIg} size={18} aria-hidden="true" />
        <input type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={100}
          value={value} onChange={event => setValue(event.target.value)} onBlur={() => setTouched(true)}
          placeholder={trial('placeholder')} aria-label={trial('label')} aria-invalid={!!error || undefined} aria-describedby={noteId} />
      </label>
      <button type="submit" className={styles.promptButton} disabled={submitting} aria-busy={submitting}>
        {submitting ? trial('submitting') : trial('cta')}{!submitting && <ArrowRight size={17} aria-hidden="true" />}
      </button>
      <p id={noteId} className={styles.promptNote} data-error={!!error || undefined} role="status">{error}</p>
    </form>
  </div>
}
