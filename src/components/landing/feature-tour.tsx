'use client'

import { useEffect, useEffectEvent, useRef, useState, type DragEvent, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { ArrowRight, ArrowUp, ArrowUpRight, CalendarDays, Check, Clock, ExternalLink, Eye, GripVertical, Heart, MessageCircle, RotateCcw, ScanSearch, Send, Sparkles, TrendingUp, Users, WandSparkles, X, Zap } from 'lucide-react'
import { MimoIcon } from '@/components/mimo-mascot-icon'
import { InstagramFillIcon } from '@/components/brand-icons'
import styles from './feature-tour.module.css'

type Stop = 'chat' | 'schedule' | 'design' | 'autodm' | 'analytics'
type Side = 'top' | 'right' | 'left' | 'center'
type Face = 'idle' | 'smile' | 'happy' | 'wink' | 'wow'

/**
 * Where Mimo perches at each stop: on `anchor` (default: the demo card) at `side`. `press` is the button Mimo "taps"
 * mid-stop (we click it for real when that happens). In the chat Mimo sits in its own seat inside the chat log.
 */
const STOPS: { stop: Stop; side: Side; face: Face; fx: 'elastic' | 'glow'; aim: string; anchor?: string }[] = [
  { stop: 'chat', side: 'center', face: 'smile', fx: 'elastic', aim: '[data-ft-aim="chat"]', anchor: '[data-ft-seat="chat"]' },
  { stop: 'schedule', side: 'left', face: 'happy', fx: 'glow', aim: '[data-ft-aim="schedule"]' },
  { stop: 'design', side: 'right', face: 'wow', fx: 'glow', aim: '[data-ft-aim="design"]' },
  { stop: 'autodm', side: 'top', face: 'wink', fx: 'elastic', aim: '[data-ft-aim="autodm"]' },
  { stop: 'analytics', side: 'top', face: 'happy', fx: 'glow', aim: '[data-ft-aim="analytics"]' },
]

const ease = [0.22, 1, 0.36, 1] as const
/** Design scan timing (ms): first post read, each next post, pause on the full brand kit before the deck. */
const SCAN_START = 100
const SCAN_STEP = 70
const SCAN_HOLD = 280

/**
 * Every picture the demos show, in one place. These are placeholders from public/covers (4:5, 1122×1402): swap the
 * paths for the real generated designs and every demo picks them up.
 */
const cover = (name: string) => `/covers/${name}.webp`
const DEMO_ART = {
  /** Mimo's reply in the chat: one finished carousel per suggested prompt. */
  chat: [
    ['12-wellness', '18-fitness', '03-cafe', '13-education', '16-travel'].map(cover),
    ['20-umkm-branding', '04-bakery', '05-restaurant', '15-modest-fashion', '01-beauty-skincare'].map(cover),
  ],
  /** Carousels waiting in the auto-post queue (schedule demo), plus the one already live. */
  queue: ['03-cafe', '01-beauty-skincare', '18-fitness', '16-travel'].map(cover),
  posted: cover('12-wellness'),
  /** The brand's current Instagram feed that gets analyzed (design demo). */
  feed: ['01-beauty-skincare', '02-haircare', '12-wellness', '15-modest-fashion', '19-wedding-organizer', '06-architecture', '11-property', '03-cafe', '04-bakery'].map(cover),
  /** What comes back: the feed redone in one consistent look, plus brand-new ideas. */
  made: ['01-beauty-skincare', '12-wellness', '02-haircare', '15-modest-fashion', '19-wedding-organizer', '11-property'].map(cover),
  /** The post people comment on (auto DM demo). */
  dmPost: cover('20-umkm-branding'),
} as const

function Art({ src, alt = '', sizes = '160px', className }: { src: string; alt?: string; sizes?: string; className?: string }) {
  return <Image src={src} alt={alt} width={1122} height={1402} sizes={sizes} className={className ?? styles.art} unoptimized draggable={false} />
}

/** setTimeout that is cleared on unmount; with motion off every delay collapses to an instant step. */
function useTimers(motionEnabled: boolean) {
  const ids = useRef<number[]>([])
  useEffect(() => () => ids.current.forEach(id => window.clearTimeout(id)), [])
  return (fn: () => void, ms: number) => { ids.current.push(window.setTimeout(fn, motionEnabled ? ms : 0)) }
}

/** Runs `fn` when the floating Mimo lands on this stop (window `mimo-tour` event). */
function useTourArrive(stop: Stop, fn: () => void) {
  const onArrive = useEffectEvent(fn)
  useEffect(() => {
    const listener = (event: Event) => { if ((event as CustomEvent<{ stop?: string }>).detail?.stop === stop) onArrive() }
    window.addEventListener('mimo-tour', listener)
    return () => window.removeEventListener('mimo-tour', listener)
  }, [stop])
}

/** True while the floating Mimo is perched on this stop. */
function useTourHere(stop: Stop | 'cta') {
  const [here, setHere] = useState(false)
  useEffect(() => {
    const listener = (event: Event) => setHere((event as CustomEvent<{ stop?: string | null }>).detail?.stop === stop)
    window.addEventListener('mimo-tour', listener)
    return () => window.removeEventListener('mimo-tour', listener)
  }, [stop])
  return here
}

function Card({ stop, title, icon, action, children }: { stop: Stop; title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <div className={styles.card} data-ft-card={stop}>
    <div className={styles.cardBar}><span className={styles.cardIcon}>{icon}</span><strong>{title}</strong>{action}</div>
    {children}
  </div>
}

function MimoAvatar({ size = 30 }: { size?: number }) {
  return <span className={styles.mimoAvatar} style={{ width: size, height: size }}><MimoIcon size={size * 0.78} /></span>
}

/* ───────────────────────────── Chat ───────────────────────────── */

type ChatMessage = { id: number; from: 'you' | 'mimo'; text: string; deck?: 1 | 2 }

/** The finished carousel Mimo drops into the chat: a swipeable strip of slides that deal in one after another. */
function ChatCarousel({ deck, motionEnabled }: { deck: 1 | 2; motionEnabled: boolean }) {
  const t = useTranslations('landing.featureTour.chat')
  const slides = DEMO_ART.chat[deck - 1]
  return <div className={styles.chatDeck}>
    <div className={styles.chatStrip} role="group" aria-label={t('carouselLabel', { count: slides.length })} tabIndex={0}>
      {slides.map((name, index) => <motion.figure key={name} className={styles.chatSlide}
        initial={motionEnabled ? { opacity: 0, x: 46, rotate: 7, scale: .88 } : false} animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
        transition={{ delay: .1 + index * .09, type: 'spring', stiffness: 260, damping: 22 }}>
        <Art src={name} alt={t('slideAlt', { n: index + 1, total: slides.length })} sizes="120px" />
        <span className={styles.chatSlideNum} aria-hidden="true">{index + 1}/{slides.length}</span>
      </motion.figure>)}
    </div>
    <div className={styles.chatDeckFoot}>
      <span>{t('ready', { count: slides.length })}</span>
      <Link href="/daftar" className={styles.miniLink}>{t('review')} <ArrowUpRight size={13} /></Link>
    </div>
  </div>
}

function ChatDemo({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing.featureTour.chat')
  const later = useTimers(motionEnabled)
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 0, from: 'mimo', text: t('intro') }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const nextId = useRef(1)
  const inputRef = useRef<HTMLInputElement>(null)

  const seated = useTourHere('chat') && motionEnabled

  useTourArrive('chat', () => { if (messages.length === 1 && !input) setInput(t('prompt1')) })

  const send = () => {
    const text = input.trim()
    if (!text || typing) return
    const deck = text === t('prompt2') ? 2 : 1
    setMessages(list => [...list, { id: nextId.current++, from: 'you' as const, text }].slice(-3))
    setInput('')
    setTyping(true)
    later(() => {
      setTyping(false)
      setMessages(list => [...list, { id: nextId.current++, from: 'mimo' as const, text: t(deck === 2 ? 'reply2' : 'reply1'), deck: deck as 1 | 2 }].slice(-3))
    }, 1500)
  }

  return <Card stop="chat" title={t('title')} icon={<MimoAvatar size={26} />} action={<span className={styles.online}><i />{t('online')}</span>}>
    <div className={styles.chatLog} data-motion={motionEnabled ? 'on' : 'off'}>
      <div className={styles.chatFeed} aria-live="polite">
        <AnimatePresence initial={false}>
          {messages.map(message => <motion.div key={message.id} layout={motionEnabled ? 'position' : false} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .45, ease }} className={message.from === 'you' ? styles.msgYou : styles.msgMimo}>
            <div className={message.deck ? `${styles.bubble} ${styles.deckBubble}` : styles.bubble}>
              <span className={styles.srOnly}>{t(message.from)}: </span>{message.text}
              {message.deck && <ChatCarousel deck={message.deck} motionEnabled={motionEnabled} />}
            </div>
          </motion.div>)}
          {typing && <motion.div key="typing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.msgMimo}>
            <div className={`${styles.bubble} ${styles.typing}`} role="status"><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>{t('typing')}</div>
          </motion.div>}
        </AnimatePresence>
      </div>
      {/* Mimo's seat: the floating Mimo lands here, inside the chat, and its speech bubble opens to the right like a
          message. While it is away (or without the tour) a small Mimo keeps the seat. */}
      <div className={styles.seatRow} data-here={seated || undefined} aria-hidden="true">
        <span className={styles.seat} data-ft-seat="chat"><MimoAvatar size={44} /></span>
        <span className={styles.seatHint}><b>Mimo</b>{t('seatHint')}</span>
      </div>
    </div>
    <div className={styles.chips}>{(['prompt1', 'prompt2'] as const).map(key => <button key={key} type="button" className={styles.chip} onClick={() => { setInput(t(key)); inputRef.current?.focus() }}><Sparkles size={13} />{t(key)}</button>)}</div>
    <form className={styles.composer} data-ft-aim="chat" onSubmit={event => { event.preventDefault(); send() }}>
      <input ref={inputRef} value={input} onChange={event => setInput(event.target.value)} placeholder={t('placeholder')} aria-label={t('placeholder')} />
      <button type="submit" className={styles.sendButton} data-ft-press="chat" aria-label={t('send')} disabled={!input.trim() || typing}><ArrowUp size={17} strokeWidth={2.4} /></button>
    </form>
  </Card>
}

/* ─────────────────────────── Schedule ─────────────────────────── */

const DRAFTS = ['draft1', 'draft2', 'draft3', 'draft4'] as const
type Draft = typeof DRAFTS[number]
/** The best times this week, in the order auto-schedule fills them. Tuesday (1) already has a live post. */
const BEST_SLOTS = [{ day: 3, time: '19:00' }, { day: 5, time: '11:00' }, { day: 0, time: '08:30' }, { day: 6, time: '16:00' }]
const DAY_TIME = ['08:30', '12:00', '18:30', '19:00', '12:00', '11:00', '16:00']
const DRAFT_ART: Record<Draft, string> = { draft1: DEMO_ART.queue[0], draft2: DEMO_ART.queue[1], draft3: DEMO_ART.queue[2], draft4: DEMO_ART.queue[3] }

function ScheduleDemo({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing.featureTour.schedule')
  const format = useFormatter()
  const later = useTimers(motionEnabled)
  const [placed, setPlaced] = useState<Partial<Record<Draft, { day: number; time: string }>>>({})
  const [selected, setSelected] = useState<Draft | null>(null)
  const [status, setStatus] = useState('')
  const [over, setOver] = useState<number | null>(null)
  const [auto, setAuto] = useState(false)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10, 2 + index))
    return { short: format.dateTime(date, { weekday: 'short', timeZone: 'UTC' }), long: format.dateTime(date, { weekday: 'long', timeZone: 'UTC' }), num: 2 + index }
  })
  const waiting = DRAFTS.filter(draft => !placed[draft])

  const place = (draft: Draft, day: number) => {
    const time = BEST_SLOTS.find(slot => slot.day === day)?.time ?? DAY_TIME[day]
    setPlaced(current => ({ ...current, [draft]: { day, time } }))
    setSelected(null)
    setStatus(t('scheduled', { title: t(draft), day: days[day].long, time }))
  }
  /** Auto-schedule: every waiting carousel flies to the next free best slot, one after another. */
  const scheduleAll = () => {
    if (auto || waiting.length === 0) return
    const taken = new Set(Object.values(placed).map(slot => slot?.day))
    const free = BEST_SLOTS.filter(slot => !taken.has(slot.day))
    setAuto(true)
    setSelected(null)
    const queue = [...waiting]
    queue.forEach((draft, index) => later(() => {
      const slot = free[index] ?? BEST_SLOTS[index % BEST_SLOTS.length]
      setPlaced(current => ({ ...current, [draft]: { day: slot.day, time: slot.time } }))
      if (index === queue.length - 1) { setAuto(false); setStatus(t('done')) }
    }, 320 + index * 380))
  }
  const onDrop = (event: DragEvent, day: number) => {
    event.preventDefault()
    setOver(null)
    const draft = event.dataTransfer.getData('text/plain') as Draft
    if (DRAFTS.includes(draft)) place(draft, day)
  }
  const flight = motionEnabled ? { type: 'spring' as const, stiffness: 320, damping: 30 } : { duration: 0 }

  return <Card stop="schedule" title={t('title')} icon={<CalendarDays size={16} />} action={<span className={styles.autoPill}><i />{t('week')}</span>}>
    <LayoutGroup id="ft-schedule">
      <div className={styles.week} data-ft-aim="schedule">
        {days.map((day, index) => {
          const posts = DRAFTS.filter(draft => placed[draft]?.day === index)
          return <button key={day.num} type="button" className={styles.day} data-over={over === index || undefined} data-armed={selected ? true : undefined}
            aria-disabled={!selected} aria-label={t('dropOn', { day: day.long })}
            onClick={() => { if (selected) place(selected, index) }}
            onDragOver={event => { event.preventDefault(); setOver(index) }} onDragLeave={() => setOver(null)} onDrop={event => onDrop(event, index)}>
            <span className={styles.dayHead}><span>{day.short}</span><b>{day.num}</b></span>
            {index === 1 && <span className={styles.post} data-live="">
              <span className={styles.postThumb}><Art src={DEMO_ART.posted} sizes="80px" /><span className={styles.postBadge}><InstagramFillIcon size={9} /></span></span>
              <span className={styles.postTime}>{t('liveBadge')}</span>
              <span className={styles.srOnly}>{t('existing')}</span>
            </span>}
            {posts.map(draft => <motion.span key={draft} layoutId={`ft-q-${draft}`} transition={flight} className={styles.post}>
              <span className={styles.postThumb}><Art src={DRAFT_ART[draft]} sizes="80px" /><span className={styles.postBadge}><Clock size={9} /></span></span>
              <span className={styles.postTime}>{placed[draft]?.time}</span>
              <span className={styles.srOnly}>{t(draft)}, {t('autoBadge')}</span>
            </motion.span>)}
          </button>
        })}
      </div>
      <div className={styles.tray}>
        <div className={styles.trayHead}><span className={styles.trayLabel}>{t('drafts')}</span><span className={styles.trayCount}>{waiting.length}</span></div>
        <div className={styles.drafts}>
          {waiting.length === 0
            ? <motion.span className={styles.doneNote} initial={motionEnabled ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }}><Check size={14} />{t('done')}</motion.span>
            : waiting.map(draft => <motion.div key={draft} layoutId={`ft-q-${draft}`} transition={flight} className={styles.draftWrap}>
              <button type="button" draggable={!auto} className={styles.draft} aria-pressed={selected === draft} disabled={auto}
                onClick={() => setSelected(selected === draft ? null : draft)}
                onDragStart={event => { event.dataTransfer.setData('text/plain', draft); event.dataTransfer.effectAllowed = 'move'; setSelected(draft) }}>
                <Art src={DRAFT_ART[draft]} sizes="90px" />
                <span className={styles.draftTitle}><GripVertical size={11} className={styles.grip} aria-hidden="true" />{t(draft)}</span>
              </button>
            </motion.div>)}
        </div>
        <div className={styles.trayFoot}>
          <p className={styles.status} aria-live="polite">{waiting.length === 0 ? '' : status || (selected ? t('selectedHint', { title: t(selected) }) : t('hint'))}</p>
          {waiting.length === 0
            ? <button type="button" className={styles.ghostButton} onClick={() => { setPlaced({}); setStatus('') }}><RotateCcw size={14} />{t('reset')}</button>
            : <button type="button" className={styles.primaryButton} data-ft-press="schedule" disabled={auto} onClick={scheduleAll}><WandSparkles size={14} />{auto ? t('working') : t('button')}</button>}
        </div>
      </div>
    </LayoutGroup>
  </Card>
}

/* ──────────────────────────── Design ──────────────────────────── */

/** What the analysis "finds" in the feed: the brand kit every new design follows. */
const BRAND_COLORS = ['#f3ede3', '#2f4a3a', '#c8a27a', '#8c5a4a', '#1d1a2a']
const TONES = ['a', 'b', 'c'] as const
/** The designs that come back: the old posts redone in one look, then brand-new ideas. */
const MADE = DEMO_ART.made.map((src, index) => ({ src, kind: index < 4 ? 'remake' as const : 'fresh' as const }))
type Made = typeof MADE[number]
/** Resting tilt of the cards under the top one, so the stack fans out like a dealt hand. */
const FAN = [0, -5, 4]

function DeckCard({ item, n, depth, motionEnabled, onDecide }: { item: Made; n: number; depth: number; motionEnabled: boolean; onDecide: (dir: 1 | -1) => void }) {
  const t = useTranslations('landing.featureTour.design')
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-220, 220], [-18, 18])
  const yes = useTransform(x, [16, 100], [0, 1])
  const no = useTransform(x, [-100, -16], [1, 0])
  const top = depth === 0
  return <motion.div className={styles.deckSlot} style={{ zIndex: 10 - depth }}
    variants={{ gone: (dir: number) => ({ x: dir * 420, y: -30, rotate: dir * 28, opacity: 0, transition: { duration: .5, ease } }) }}
    initial={motionEnabled ? { opacity: 0, x: 180, y: 90, rotate: 24, scale: .85 } : false}
    animate={{ opacity: 1, x: 0, y: depth * 10, rotate: FAN[depth] ?? 0, scale: 1 - depth * .055 }}
    exit="gone"
    transition={motionEnabled ? { type: 'spring', stiffness: 230, damping: 22, delay: depth * .06 } : { duration: 0 }}>
    <motion.div className={styles.deckCard} style={{ x, rotate }} data-top={top || undefined}
      drag={top ? 'x' : false} dragMomentum={false}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 650) onDecide(info.offset.x > 0 ? 1 : -1)
        else animate(x, 0, { type: 'spring', stiffness: 420, damping: 30 })
      }}>
      <span className={styles.frameTop}><i />{t('handle')}<span>{n}/{MADE.length}</span></span>
      <Art src={item.src} alt={t('madeAlt', { n, total: MADE.length, kind: t(item.kind) })} sizes="220px" />
      <span className={styles.frameFoot} data-kind={item.kind}>{item.kind === 'fresh' ? <Sparkles size={11} /> : <RotateCcw size={11} />}{t(item.kind)}</span>
      {top && <>
        <motion.span className={styles.stamp} data-yes="" style={{ opacity: yes }} aria-hidden="true">{t('yes')}</motion.span>
        <motion.span className={styles.stamp} style={{ opacity: no }} aria-hidden="true">{t('no')}</motion.span>
      </>}
    </motion.div>
  </motion.div>
}

function DesignDemo({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing.featureTour.design')
  const later = useTimers(motionEnabled)
  const [phase, setPhase] = useState<'idle' | 'scan' | 'made'>('idle')
  const [scanned, setScanned] = useState(0)
  const [left, setLeft] = useState<Made[]>(MADE)
  const [approved, setApproved] = useState<Made[]>([])
  const [dir, setDir] = useState<1 | -1>(1)
  const [status, setStatus] = useState('')
  const touched = useRef(false)
  const feed = DEMO_ART.feed
  const kit = phase === 'made' ? 4 : Math.min(4, Math.floor(scanned / 2))

  // A ref mirrors the deck so timers and quick double taps always act on the current top card.
  const deck = useRef<Made[]>(MADE)
  const decide = (choice: 1 | -1, auto = false) => {
    if (!auto) touched.current = true
    const [first, ...rest] = deck.current
    if (!first) return
    deck.current = rest
    setDir(choice)
    setLeft(rest)
    if (choice === 1) setApproved(done => [...done, first])
    setStatus(choice === 1 ? t('approved') : t('skipped'))
  }
  const analyze = () => {
    if (phase === 'scan') return
    touched.current = false
    setPhase('scan')
    setScanned(0)
    deck.current = MADE
    setLeft(MADE)
    setApproved([])
    setStatus(t('scanning', { done: 0, total: feed.length }))
    // Quick on purpose (~1s): visitors scroll past fast, the scan only has to read as "it looked at my feed".
    feed.forEach((_, index) => later(() => setScanned(index + 1), SCAN_START + index * SCAN_STEP))
    later(() => {
      setPhase('made')
      setStatus(t('madeStatus', { count: MADE.length }))
      // Show the gesture once: if nobody touched the deck, the first design swipes itself into the schedule.
      if (motionEnabled) later(() => { if (!touched.current) decide(1, true) }, 2200)
    }, SCAN_START + feed.length * SCAN_STEP + SCAN_HOLD)
  }

  return <Card stop="design" title={t('title')} icon={<WandSparkles size={16} />} action={<span className={styles.barMeta}>{phase === 'made' ? t('queued', { count: approved.length }) : t('handleAt')}</span>}>
    <AnimatePresence mode="wait" initial={false}>
      {phase !== 'made'
        ? <motion.div key="scan" className={styles.studio} exit={motionEnabled ? { opacity: 0, scale: .97, filter: 'blur(4px)' } : undefined} transition={{ duration: .22 }}>
          <div className={styles.igPanel} data-ft-aim="design">
            <div className={styles.igHead}>
              <span className={styles.igAvatar}><InstagramFillIcon size={13} /></span>
              <span><b>{t('handleAt')}</b><small>{t('feedLabel', { count: feed.length })}</small></span>
            </div>
            <div className={styles.igGrid} role="img" aria-label={t('feedAlt', { count: feed.length })} data-scan={phase === 'scan' || undefined}>
              {feed.map((src, index) => <span key={src} className={styles.igCell} data-read={index < scanned || undefined}>
                <Art src={src} sizes="90px" />
                <i aria-hidden="true"><Check size={10} strokeWidth={3} /></i>
              </span>)}
              {phase === 'scan' && <span className={styles.scanBeam} aria-hidden="true" />}
            </div>
          </div>
          <div className={styles.kit}>
            <span className={styles.trayLabel}>{t('kitTitle')}</span>
            <div className={styles.kitRow} data-on={kit >= 1 || undefined}>
              <small>{t('colors')}</small>
              <span className={styles.palette}>{BRAND_COLORS.map((color, index) => <i key={color} style={{ background: color, transitionDelay: `${index * 70}ms` }} />)}</span>
            </div>
            <div className={styles.kitRow} data-on={kit >= 2 || undefined}>
              <small>{t('font')}</small>
              <span className={styles.fontSample}><b>Aa</b>{t('fontName')}</span>
            </div>
            <div className={styles.kitRow} data-on={kit >= 3 || undefined}>
              <small>{t('tone')}</small>
              <span className={styles.toneChips}>{TONES.map(key => <em key={key}>{t(`tones.${key}`)}</em>)}</span>
            </div>
            <div className={styles.kitFoot}>
              {phase === 'scan'
                ? <span className={styles.scanNote}><Sparkles size={13} />{t('scanning', { done: scanned, total: feed.length })}</span>
                : <><p>{t('kitEmpty')}</p><button type="button" className={styles.primaryButton} data-ft-press="design" onClick={analyze}><ScanSearch size={14} />{t('analyze')}</button></>}
            </div>
          </div>
        </motion.div>
        : <motion.div key="deck" className={styles.deckArea} initial={motionEnabled ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: .3 }}>
          <div className={styles.kitStrip} aria-hidden="true">
            <span className={styles.palette}>{BRAND_COLORS.map(color => <i key={color} style={{ background: color }} />)}</span>
            <span className={styles.fontSample}><b>Aa</b>{t('fontName')}</span>
            <span className={styles.toneChips}>{TONES.map(key => <em key={key}>{t(`tones.${key}`)}</em>)}</span>
          </div>
          <div className={styles.deckStage} data-ft-aim="design">
            <div className={styles.deck} role="group" aria-label={t('deckLabel')}>
              <AnimatePresence custom={dir}>
                {left.slice(0, 3).map((item, depth) => <DeckCard key={item.src} item={item} n={MADE.indexOf(item) + 1} depth={depth} motionEnabled={motionEnabled} onDecide={choice => decide(choice)} />).reverse()}
              </AnimatePresence>
              {left.length === 0 && <motion.div className={styles.deckDone} initial={motionEnabled ? { opacity: 0, scale: .9 } : false} animate={{ opacity: 1, scale: 1 }}>
                <span><Check size={18} /></span>
                <p>{t('done', { count: approved.length })}</p>
                <button type="button" className={styles.ghostButton} onClick={analyze}><RotateCcw size={13} />{t('again')}</button>
              </motion.div>}
            </div>
            <div className={styles.deckSide}>
              <p className={styles.swipeHint}>{t('swipeHint')}</p>
              <div className={styles.decide}>
                <button type="button" className={styles.noButton} aria-label={t('skip')} disabled={!left.length} onClick={() => decide(-1)}><X size={18} strokeWidth={2.6} /></button>
                <button type="button" className={styles.yesButton} aria-label={t('approve')} disabled={!left.length} onClick={() => decide(1)}><Heart size={18} strokeWidth={2.6} /></button>
              </div>
              <div className={styles.queue}>
                <span className={styles.trayLabel}>{t('queueLabel')}</span>
                <div className={styles.queueThumbs}>
                  <AnimatePresence initial={false}>{approved.map(item => <motion.span key={item.src} className={styles.queueThumb}
                    initial={motionEnabled ? { opacity: 0, x: -50, y: -60, rotate: -14, scale: 1.6 } : false} animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22, delay: .15 }}>
                    <Art src={item.src} sizes="40px" />
                  </motion.span>)}</AnimatePresence>
                  {approved.length === 0 && <span className={styles.queueEmpty}><CalendarDays size={13} />{t('queueEmpty')}</span>}
                </div>
              </div>
            </div>
          </div>
        </motion.div>}
    </AnimatePresence>
    <p className={styles.srOnly} aria-live="polite">{status}</p>
  </Card>
}

/* ──────────────────────────── Auto DM ──────────────────────────── */

const KEYWORD = 'LINK'
/** One live conversation: comment → public reply → DM prompt → keyword → typing → DM with the link button. */
type DmStep = 'comment' | 'reply' | 'prompt' | 'answer' | 'typing' | 'link'
const DM_FLOW: { step: DmStep; at: number }[] = [
  { step: 'comment', at: 0 }, { step: 'reply', at: 1100 }, { step: 'prompt', at: 1900 },
  { step: 'answer', at: 3300 }, { step: 'typing', at: 3900 }, { step: 'link', at: 5100 },
]

function AutoDmDemo({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing.featureTour.autodm')
  const later = useTimers(motionEnabled)
  const [on, setOn] = useState(true)
  const onRef = useRef(true)
  /** How far the conversation got: an index into DM_FLOW (-1 = nothing yet). */
  const [upto, setUpto] = useState(-1)
  const [running, setRunning] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [sent, setSent] = useState(0)
  const [reply, setReply] = useState('')
  const replyRef = useRef('')
  const run = useRef(0)
  const at = (step: DmStep) => DM_FLOW.findIndex(item => item.step === step)
  const has = (step: DmStep) => upto >= at(step)

  const toggle = (value: boolean) => { onRef.current = value; setOn(value); setBlocked(false) }

  /** Plays the conversation from `from`. If the visitor starts typing the keyword, the autoplay waits for them. */
  const play = (from: DmStep = 'comment') => {
    const id = ++run.current
    const start = at(from)
    if (start === 0) setUpto(-1)
    setBlocked(false)
    setRunning(true)
    DM_FLOW.slice(start).forEach(({ step, at: ms }, index, list) => later(() => {
      if (run.current !== id) return
      if (step === 'reply' && !onRef.current) { run.current++; setBlocked(true); setRunning(false); return }
      if (step === 'answer' && replyRef.current) { run.current++; setRunning(false); return }
      setUpto(start + index)
      if (step === 'link') setSent(count => count + 1)
      if (index === list.length - 1) setRunning(false)
    }, ms - DM_FLOW[start].at))
  }
  const sendReply = () => {
    if (reply.trim().toUpperCase() !== KEYWORD || !has('prompt') || has('answer')) return
    run.current++
    setReply('')
    replyRef.current = ''
    setUpto(at('answer'))
    play('typing')
  }

  useTourArrive('autodm', () => { if (!running && upto < 0) play() })

  const bubble = {
    initial: motionEnabled ? { opacity: 0, y: 10, scale: .96 } : false as const,
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: .4, ease },
  }
  const waitingForKeyword = has('prompt') && !has('answer')

  return <Card stop="autodm" title={t('title')} icon={<MessageCircle size={16} />} action={<span className={styles.barMeta}>{t('count', { count: sent })}</span>}>
    <div className={styles.rule}>
      <span className={styles.ruleFlow}>
        <span className={styles.ruleNode}><MessageCircle size={12} />{t('when')} <code>{KEYWORD}</code></span>
        <ArrowRight size={13} className={styles.ruleArrow} aria-hidden="true" />
        <span className={styles.ruleNode}><Send size={12} />{t('then')}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={t('toggle')} className={styles.switch} onClick={() => toggle(!on)}><i /><span>{on ? t('on') : t('off')}</span></button>
    </div>
    <div className={styles.panes}>
      <div className={styles.pane}>
        <span className={styles.paneHead}><InstagramFillIcon size={12} />{t('post')}</span>
        <div className={styles.igPost}>
          <span className={styles.igPostImg}><Art src={DEMO_ART.dmPost} sizes="200px" /></span>
          <p className={styles.igCaption}><b>{t('brand')}</b> {t('caption', { keyword: KEYWORD })}</p>
        </div>
        <div className={styles.commentList} aria-live="polite">
          {upto < 0 && !blocked && <p className={styles.empty}>{t('empty')}</p>}
          <AnimatePresence initial={false}>
            {has('comment') && <motion.div key="c" {...bubble} className={styles.comment}>
              <span className={styles.userDot}>N</span><span><b>{t('user')}</b> {t('comment', { keyword: KEYWORD })}</span>
            </motion.div>}
            {has('reply') && <motion.div key="r" {...bubble} className={`${styles.comment} ${styles.commentReply}`}>
              <span className={styles.brandDot}><MimoIcon size={14} /></span><span><b>{t('brand')}</b> {t('publicReply')}</span>
            </motion.div>}
          </AnimatePresence>
        </div>
      </div>
      <div className={`${styles.pane} ${styles.dmPane}`} data-ft-aim="autodm">
        <span className={styles.dmHead}>
          <span className={styles.userDot}>N</span>
          <span><b>{t('user')}</b><small>{running ? t('live') : t('inbox')}</small></span>
          {running && <span className={styles.liveDot} aria-hidden="true" />}
        </span>
        <div className={styles.thread} aria-live="polite">
          {!has('prompt') && !blocked && <p className={styles.empty}>{t('emptyDm')}</p>}
          <AnimatePresence initial={false}>
            {has('prompt') && <motion.div key="p" {...bubble} className={styles.dmThem}>
              <p>{t('prompt', { name: t('userName'), keyword: KEYWORD })}</p>
              <span className={styles.dmMeta}><Zap size={10} />{t('auto')}</span>
            </motion.div>}
            {has('answer') && <motion.div key="a" {...bubble} className={styles.dmMe}><p>{KEYWORD}</p></motion.div>}
            {upto === at('typing') && <motion.div key="t" {...bubble} exit={{ opacity: 0 }} className={styles.dmThem}>
              <p className={styles.typing} role="status"><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span><span className={styles.srOnly}>{t('typing')}</span></p>
            </motion.div>}
            {has('link') && <motion.div key="l" {...bubble} className={styles.dmThem}>
              <div className={styles.dmCard}>
                <span className={styles.dmCardImg}><Art src={DEMO_ART.dmPost} sizes="120px" /></span>
                <p>{t('dm', { name: t('userName') })}</p>
                <a href="#tur-fitur" className={styles.dmLink} onClick={event => event.preventDefault()}><ExternalLink size={12} />{t('linkButton')}</a>
              </div>
              <span className={styles.dmMeta}><Check size={10} />{t('sent')}</span>
            </motion.div>}
          </AnimatePresence>
          {blocked && <p className={styles.blocked}>{t('offNote')}</p>}
        </div>
        <form className={styles.dmComposer} onSubmit={event => { event.preventDefault(); sendReply() }}>
          <input value={reply} onChange={event => { setReply(event.target.value); replyRef.current = event.target.value }} disabled={!waitingForKeyword} placeholder={waitingForKeyword ? t('typeKeyword', { keyword: KEYWORD }) : t('message')} aria-label={t('typeKeyword', { keyword: KEYWORD })} />
          <button type="submit" aria-label={t('send')} disabled={!waitingForKeyword || reply.trim().toUpperCase() !== KEYWORD}><ArrowUp size={14} strokeWidth={2.6} /></button>
        </form>
      </div>
    </div>
    <div className={`${styles.trayFoot} ${styles.endFoot}`}>
      <p className={styles.status}>{waitingForKeyword ? t('tryIt', { keyword: KEYWORD }) : t('hint', { keyword: KEYWORD })}</p>
      <button type="button" className={styles.primaryButton} data-ft-press="autodm" disabled={running} onClick={() => play()}>{upto >= 0 ? <RotateCcw size={14} /> : <MessageCircle size={14} />}{upto >= 0 ? t('replay') : t('simulate')}</button>
    </div>
  </Card>
}

/* ─────────────────────────── Analytics ─────────────────────────── */

const RANGES = {
  d7: { reach: 12400, engagement: .048, followers: 186, delta: [.12, .006, .08], bars: [38, 52, 44, 61, 57, 72, 66, 80] },
  d30: { reach: 48200, engagement: .061, followers: 812, delta: [.27, .013, .19], bars: [30, 41, 49, 46, 63, 70, 84, 96] },
  d90: { reach: 131500, engagement: .056, followers: 2340, delta: [.41, .009, .33], bars: [22, 34, 31, 47, 55, 52, 74, 88] },
} as const
type Range = keyof typeof RANGES

function AnalyticsDemo() {
  const t = useTranslations('landing.featureTour.analytics')
  const format = useFormatter()
  const [range, setRange] = useState<Range>('d7')
  const data = RANGES[range]
  const kpis = [
    { label: t('reach'), value: format.number(data.reach, { notation: 'compact', maximumFractionDigits: 1 }), delta: format.number(data.delta[0], { style: 'percent', signDisplay: 'always' }), icon: <Eye size={14} /> },
    { label: t('engagement'), value: format.number(data.engagement, { style: 'percent', maximumFractionDigits: 1 }), delta: format.number(data.delta[1], { style: 'percent', signDisplay: 'always', maximumFractionDigits: 1 }), icon: <Heart size={14} /> },
    { label: t('followers'), value: format.number(data.followers), delta: format.number(data.delta[2], { style: 'percent', signDisplay: 'always' }), icon: <Users size={14} /> },
  ]
  return <Card stop="analytics" title={t('title')} icon={<TrendingUp size={16} />} action={<div className={styles.segmented} role="group" aria-label={t('chart')}>
    {(Object.keys(RANGES) as Range[]).map(key => <button key={key} type="button" aria-pressed={range === key} data-ft-press={key === 'd30' ? 'analytics' : undefined} onClick={() => setRange(key)}>{t(`ranges.${key}`)}</button>)}
  </div>}>
    <div className={styles.kpis}>{kpis.map(kpi => <div key={kpi.label} className={styles.kpi}>
      <span className={styles.kpiLabel}>{kpi.icon}{kpi.label}</span>
      <strong key={`${range}-${kpi.value}`} className={styles.kpiValue}>{kpi.value}</strong>
      <span className={styles.delta}><TrendingUp size={11} />{kpi.delta}</span>
    </div>)}</div>
    <div className={styles.chart} data-ft-aim="analytics" role="img" aria-label={`${t('chart')}: ${t(`ranges.${range}`)}`}>
      {data.bars.map((height, index) => <span key={index} style={{ transform: `scaleY(${height / 100})`, transitionDelay: `${index * 45}ms` }} data-last={index === data.bars.length - 1 || undefined} />)}
    </div>
    <div className={styles.topPost}>
      <span className={styles.topThumb} aria-hidden="true" />
      <span><small>{t('top')}</small><b>{t('topPost')}</b></span>
      <strong>{format.number(Math.round(data.reach * .31), { notation: 'compact', maximumFractionDigits: 1 })}</strong>
    </div>
  </Card>
}

/* ──────────────────────────── Section ──────────────────────────── */

export function FeatureTour({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing.featureTour')
  const root = useRef<HTMLElement>(null)
  const armed = useRef<Partial<Record<Stop, boolean>>>({})

  // Mimo lands on a stop → arm it; when Mimo then "presses" the stop's button (data-tour-pressed), click it for real once.
  useEffect(() => {
    const section = root.current
    if (!section) return
    const onTour = (event: Event) => {
      const stop = (event as CustomEvent<{ stop?: string }>).detail?.stop as Stop | undefined
      if (stop) armed.current[stop] = true
    }
    const observer = new MutationObserver(records => {
      for (const record of records) {
        const element = record.target as HTMLElement
        const stop = element.closest<HTMLElement>('[data-tour-stop]')?.dataset.tourStop as Stop | undefined
        if (!stop || !element.hasAttribute('data-tour-pressed') || !armed.current[stop] || !element.matches('[data-ft-press]')) continue
        armed.current[stop] = false
        window.setTimeout(() => { if (!(element as HTMLButtonElement).disabled) element.click() }, 120)
      }
    })
    observer.observe(section, { subtree: true, attributes: true, attributeFilter: ['data-tour-pressed'] })
    window.addEventListener('mimo-tour', onTour)
    return () => { observer.disconnect(); window.removeEventListener('mimo-tour', onTour) }
  }, [])

  const demos: Record<Stop, ReactNode> = {
    chat: <ChatDemo motionEnabled={motionEnabled} />,
    schedule: <ScheduleDemo motionEnabled={motionEnabled} />,
    design: <DesignDemo motionEnabled={motionEnabled} />,
    autodm: <AutoDmDemo motionEnabled={motionEnabled} />,
    analytics: <AnalyticsDemo />,
  }
  const ctaHere = useTourHere('cta') && motionEnabled
  const reveal = (delay = 0) => motionEnabled
    ? { initial: { opacity: 0, y: 26 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .25 }, transition: { duration: .8, delay, ease } }
    : { initial: false as const }

  return <section ref={root} className={styles.tour} id="tur-fitur" aria-labelledby="feature-tour-title" data-motion={motionEnabled ? 'on' : 'off'}>
    <motion.header className={styles.intro} {...reveal()}>
      <span className={styles.eyebrow}><Sparkles size={14} />{t('eyebrow')}</span>
      <h2 id="feature-tour-title">{t('title')}</h2>
      <p>{t('subtitle')}</p>
    </motion.header>
    <div className={styles.steps}>
      {STOPS.map(({ stop, side, face, fx, aim, anchor }, index) => <article key={stop} className={styles.step} aria-labelledby={`ft-${stop}-title`}
        data-tour-stop={stop} data-tour-anchor={anchor ?? `[data-ft-card="${stop}"]`} data-tour-side={side} data-tour-face={face} data-tour-fx={fx}
        data-tour-aim={aim} data-tour-press={`[data-ft-press="${stop}"]`} data-tour-say={t(`steps.${stop}.say`)}>
        <div className={styles.stage} data-flip={index % 2 === 1 || undefined}>
          <motion.div className={styles.copy} {...reveal()}>
            <span className={styles.kicker}><b>{String(index + 1).padStart(2, '0')}</b>{t(`steps.${stop}.kicker`)}<span className={styles.srOnly}> ({t('count', { current: index + 1, total: STOPS.length })})</span></span>
            <h3 id={`ft-${stop}-title`}>{t(`steps.${stop}.title`)}</h3>
            <p>{t(`steps.${stop}.body`)}</p>
            <aside className={motionEnabled ? `${styles.sneak} ${styles.sneakTour}` : styles.sneak}><MimoAvatar size={34} /><span><small>{t('sneak')}</small>{t(`steps.${stop}.say`)}</span></aside>
          </motion.div>
          <motion.div className={styles.demo} {...reveal(.12)}>{demos[stop]}</motion.div>
        </div>
      </article>)}
    </div>
    {/* The tour ends here: Mimo flies into the seat and stays in the card, scrolling with it, with no speech bubble. */}
    <motion.div className={styles.outro} data-tour-stop="cta" data-tour-dock="" data-tour-anchor='[data-ft-seat="cta"]' data-tour-face="happy" data-tour-fx="elastic" data-tour-aim="a" {...reveal()}>
      <span className={styles.ctaSeat} data-ft-seat="cta" data-here={ctaHere || undefined} aria-hidden="true"><MimoAvatar size={40} /></span>
      <p>{t('cta')}</p>
      <Link href="/daftar" className={styles.primaryButton}>{t('start')}<ArrowUpRight size={15} /></Link>
    </motion.div>
  </section>
}
