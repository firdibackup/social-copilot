'use client'

import { useTranslations } from 'next-intl'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useMotionValueEvent, useScroll, type MotionStyle, type MotionValue } from 'framer-motion'
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Send, Sparkles } from 'lucide-react'
import { InstagramFillIcon, MetaFillIcon, ThreadsFillIcon } from '@/components/brand-icons'
import { InstagramIcon } from '@/components/instagram-icon'
import { MimoMascot } from '@/components/mimo-mascot'
import styles from './homepage-story.module.css'

function Instagram({ size }: { size: number }) { return <InstagramIcon width={size} height={size} /> }

const names = ['01-beauty-skincare', '02-haircare', '03-cafe', '04-bakery', '05-restaurant', '06-architecture', '07-legal-service', '08-finance-service', '09-hr-recruitment', '10-digital-agency', '11-property', '12-wellness', '13-education', '14-automotive', '15-modest-fashion', '16-travel', '17-saas-technology', '18-fitness', '19-wedding-organizer', '20-umkm-branding']
function useCoverLabels() {
  const t = useTranslations('landing.story')
  return [t('covers.label0'), t('covers.label1'), t('covers.label2'), t('covers.label3'), t('covers.label4'), t('covers.label5'), t('covers.label6'), t('covers.label7'), t('covers.label8'), t('covers.label9'), t('covers.label10'), t('covers.label11'), t('covers.label12'), t('covers.label13'), t('covers.label14'), t('covers.label15'), t('covers.label16'), t('covers.label17'), t('covers.label18'), t('covers.label19')]
}
function Cover({ index, className = '', priority = false }: { index: number; className?: string; priority?: boolean }) {
  const t = useTranslations('landing.story')
  const labels = useCoverLabels()
  return <Image className={className} src={`/covers/${names[index]}.webp`} alt={t('covers.alt', { category: labels[index] })} width={1122} height={1402} sizes="(max-width: 760px) 160px, 240px" unoptimized priority={priority} />
}

export function GalleryHero({ motionEnabled }: { motionEnabled: boolean }) {
  const instagramGradient = useId()
  const t = useTranslations('landing.story')
  const labels = useCoverLabels()
  return <section className={styles.hero} aria-labelledby="hero-title">
    <div className={styles.heroCopy}>
      <span className={styles.eyebrow}>
        <svg width={0} height={0} aria-hidden="true" style={{ position: 'absolute' }}><defs><linearGradient id={instagramGradient} x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#feda75" /><stop offset="35%" stopColor="#fa7e1e" /><stop offset="65%" stopColor="#d62976" /><stop offset="100%" stopColor="#4f5bd5" /></linearGradient></defs></svg>
        <MetaFillIcon size={20} style={{ color: '#0866ff' }} /> {t('hero.trust')} <span>·</span> <InstagramFillIcon size={16} style={{ fill: `url(#${instagramGradient})` }} /> Instagram <span>&</span> <ThreadsFillIcon size={16} style={{ color: '#000' }} /> Threads
      </span>
      <h1 id="hero-title">{t('hero.title1')}<br /><span>{t('hero.title2')}</span></h1>
      <p>{t('hero.body1')}<br />{t('hero.body2')}<br className={styles.desktopBreak} /> {t('hero.body3')}</p>
      <div className={styles.actions}><Link href="/daftar" className={styles.primary}>{t('start')} <ArrowUpRight size={18} /></Link><a href="#fitur" className={styles.secondary}>{t('hero.explore')} <span>↓</span></a></div>
      <span className={styles.smallNote}>{t('hero.note')}</span>
    </div>
    <div className={styles.gallery} data-paused={!motionEnabled} aria-label={t('hero.galleryLabel')}>
      {[0, 1].map(row => <div className={`${styles.galleryTrack} ${row ? styles.reverse : ''}`} key={row}>{[0, 1].map(copy => <div className={styles.galleryGroup} key={copy} aria-hidden={copy === 1 ? true : undefined}>{names.slice(row * 10, row * 10 + 10).map((name, i) => <figure key={name}><Cover index={row * 10 + i} priority={row === 0 && i < 6} /><figcaption>{labels[row * 10 + i]}</figcaption></figure>)}</div>)}</div>)}
    </div>
  </section>
}

const showcaseFolders = [
  { key: 'beauty', covers: [0, 1, 11, 14, 17] },
  { key: 'living', covers: [2, 3, 4, 15, 18] },
  { key: 'spaces', covers: [5, 10, 12, 13, 19] },
  { key: 'business', covers: [6, 7, 8, 9, 16] },
] as const

// Bleam's public showcase module 239721: shared paper layouts, not an accordion.
// Its four-paper tables clamp/repeat for our required fifth original Drive cover.
const folderPoses = [[0, -2], [18, 1.5], [34, -1], [8, 2]] as const
const paperRest = [[16, 4], [9, 1.5], [3, -1], [0, 0], [0, 0]] as const
const paperHover = [[34, 7], [22, 3.5], [10, 0.5], [0, 0], [0, 0]] as const
const paperRotations = [-1.8, 1.4, -0.8, 2, -1.8] as const
const folderSpring = { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 } as const
const captionSpring = { type: 'spring', stiffness: 210, damping: 28 } as const

export function ContentShowcase({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing.story.showcase')
  const labels = useCoverLabels()
  const layoutId = useId()
  const [active, setActive] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [lastActive, setLastActive] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const stage = useRef<HTMLDivElement>(null)
  const scrollLeft = useRef(0)
  const close = useCallback(() => {
    if (timer.current !== null || stage.current?.dataset.open !== 'true') return
    setClosing(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setClosing(false)
      setActive(null)
    }, motionEnabled ? 140 : 0)
  }, [motionEnabled])
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
  useEffect(() => {
    if (active === null) {
      if (stage.current) stage.current.scrollLeft = scrollLeft.current
      if (lastActive) buttons.current.get(lastActive)?.focus({ preventScroll: true })
      return
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, close, lastActive])
  const selected = showcaseFolders.find(folder => folder.key === active)
  const visible = selected ? [selected] : showcaseFolders
  const transition = motionEnabled ? folderSpring : { duration: 0 }
  return <section id="konten" className={styles.showcase} data-motion={motionEnabled} aria-labelledby="showcase-title" aria-describedby="showcase-disclaimer">
    <span className={styles.eyebrow}>{t('eyebrow')}</span>
    <h2 id="showcase-title">{t('title')}</h2>
    <p>{t('subtitle')}</p>
    <p id="showcase-disclaimer" className={styles.showcaseNote}>{t('disclaimer')}</p>
    <LayoutGroup id={layoutId}>
      <div className={styles.folderWrap}>
        <div className={styles.folderBackRow}><AnimatePresence>{selected && <motion.button type="button" className={styles.folderBack} onClick={close} initial={{ opacity: 0, x: motionEnabled ? -8 : 0 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: motionEnabled ? -8 : 0, transition: { duration: motionEnabled ? 0.15 : 0 } }} transition={motionEnabled ? { ...captionSpring, delay: 0.2 } : { duration: 0 }}><ChevronLeft size={16} />{t('close')}</motion.button>}</AnimatePresence></div>
        <motion.div ref={stage} layoutScroll className={styles.folders} data-open={!!selected}>
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map(folder => {
              const { key, covers } = folder
              const [y, rotate] = folderPoses[showcaseFolders.indexOf(folder)]
              const open = key === active
              return <motion.div layout={motionEnabled} className={styles.folder} data-folder={key} key={key} style={{ zIndex: key === lastActive ? 3 : 1 }} initial={{ opacity: 0, scale: motionEnabled ? 0.92 : 1, y: y + 16, rotate }} animate={{ opacity: 1, scale: 1, y: open ? 0 : y, rotate: open ? 0 : rotate }} exit={{ opacity: 0, scale: motionEnabled ? 0.9 : 1, transition: motionEnabled ? { duration: 0.2, ease: [0.4, 0, 1, 1] } : { duration: 0 } }} transition={transition}>
                <motion.button ref={node => { if (node) buttons.current.set(key, node); else buttons.current.delete(key) }} type="button" className={styles.folderButton} aria-expanded={open} aria-label={`${t(open ? 'close' : 'open')} · ${t(key)} · ${t('count')}`} onClick={() => {
                  if (open) { close(); return }
                  if (active !== null || closing || stage.current?.dataset.open === 'true') return
                  scrollLeft.current = stage.current?.scrollLeft ?? 0
                  setLastActive(key)
                  setActive(key)
                }} initial="rest" animate="rest" whileHover={!open && motionEnabled ? 'hover' : undefined} whileTap={motionEnabled ? 'tap' : undefined} variants={{ rest: { y: 0, scale: 1 }, hover: { y: -8, scale: 1 }, tap: { y: -2, scale: 0.97 } }} transition={transition}>
                  <span className={styles.folderShadow} aria-hidden="true" />
                  {!open && covers.map((index, i) => <motion.span layoutId={`fd-${key}-${i}`} key={names[index]} className={`${styles.folderPaper} ${styles.folderTucked}`} aria-hidden="true" style={{ zIndex: covers.length - i, borderRadius: 14 }} variants={{ rest: { x: paperRest[i][0], rotate: paperRest[i][1] }, hover: { x: paperHover[i][0], rotate: paperHover[i][1] }, tap: { x: paperRest[i][0], rotate: paperRest[i][1] } }} transition={motionEnabled ? { ...folderSpring, delay: (covers.length - 1 - i) * 0.035 } : { duration: 0 }}><span className={styles.folderImage}><Cover index={index} /></span></motion.span>)}
                  <span className={styles.folderSleeve}><span>Carousely <span aria-hidden="true">↗</span></span><span className={styles.folderLabel}><strong>{t(key)}</strong><small>{t('count')}</small></span></span>
                </motion.button>
              </motion.div>
            })}
          </AnimatePresence>
          {selected?.covers.map((index, i) => <motion.figure layout={motionEnabled} className={styles.folderCell} key={`card-${selected.key}-${i}`}>
            <motion.div layoutId={`fd-${selected.key}-${i}`} className={styles.folderPaper} style={{ borderRadius: 18 }} initial={false} animate={{ rotate: paperRotations[i] }} transition={motionEnabled ? { ...folderSpring, delay: 0.05 * i } : { duration: 0 }}><span className={styles.folderImage}><Cover index={index} /></span></motion.div>
            <motion.figcaption initial={{ opacity: 0, y: motionEnabled ? 10 : 0 }} animate={closing ? { opacity: 0, y: motionEnabled ? 6 : 0 } : { opacity: 1, y: 0, rotate: 0.6 * paperRotations[i] }} transition={!motionEnabled ? { duration: 0 } : closing ? { duration: 0.12 } : { ...captionSpring, delay: 0.26 + 0.06 * i }}>{labels[index]}</motion.figcaption>
          </motion.figure>)}
        </motion.div>
      </div>
    </LayoutGroup>
  </section>
}

function useChapters() {
  const t = useTranslations('landing.story')
  return [
    { id: 'jadwal', label: t('chapters.schedule.label'), title: t('chapters.schedule.title'), description: t('chapters.schedule.description'), note: t('chapters.schedule.note'), detail: t('chapters.schedule.detail') },
    { id: 'asisten', label: t('chapters.assistant.label'), title: t('chapters.assistant.title'), description: t('chapters.assistant.description'), note: t('chapters.assistant.note'), detail: t('chapters.assistant.detail') },
    { id: 'desain', label: t('chapters.design.label'), title: t('chapters.design.title'), description: t('chapters.design.description'), note: t('chapters.design.note'), detail: t('chapters.design.detail') },
    { id: 'auto-dm', label: t('chapters.dm.label'), title: t('chapters.dm.title'), description: t('chapters.dm.description'), note: t('chapters.dm.note'), detail: t('chapters.dm.detail') },
  ]
}

function CalendarSimulation() {
  const t = useTranslations('landing.story')
  const [day, setDay] = useState(2)
  const [week, setWeek] = useState(0)
  return <div className={styles.calendar}>
    <div className={styles.panelBar}><span><i /> {t('calendar.title')}</span><span className={styles.account}><Instagram size={14} /> studio.kamu</span></div>
    <div className={styles.calendarTitle}><div><small>{t('calendar.eyebrow')}</small><h3>{t('calendar.month')}</h3></div><div className={styles.arrows}><button aria-label={t('calendar.previous')} disabled={!week} onClick={() => setWeek(0)}><ChevronLeft size={18} /></button><button aria-label={t('calendar.next')} disabled={!!week} onClick={() => setWeek(1)}><ChevronRight size={18} /></button></div></div>
    <div className={styles.days}>{[t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri')].map((name, i) => <button key={name} aria-pressed={day === i} onClick={() => setDay(i)}><span>{name}</span><b>{19 + week * 7 + i}</b><i /></button>)}</div>
    <div className={styles.schedulePost}><Cover index={day === 0 ? 0 : day === 1 ? 3 : day === 2 ? 2 : day === 3 ? 11 : 19} /><div><span className={styles.tag}>{t('calendar.format')}</span><h4>{[t('calendar.post0'), t('calendar.post1'), t('calendar.post2'), t('calendar.post3'), t('calendar.post4')][day]}</h4><p>{t('calendar.review')}</p><span className={styles.confirm}><Check size={14} /> {t('calendar.ready')}</span></div></div>
    <div className={styles.scheduleFooter} aria-live="polite"><span><b>{t('calendar.date', { day: 19 + week * 7 + day })}</b> · 09.00 WIB</span><span>Instagram <Check size={14} /></span></div>
  </div>
}

function ChatSimulation({ progress, motionEnabled }: { progress: MotionValue<number>; motionEnabled: boolean }) {
  const t = useTranslations('landing.story')
  const [task, setTask] = useState(0)
  const manual = useRef(false)
  useMotionValueEvent(progress, 'change', value => {
    if (motionEnabled && !manual.current && value >= .25 && value < .5) setTask(value < .34 ? 0 : value < .41 ? 1 : 2)
  })
  const prompts = [t('chat.prompts0'), t('chat.prompts1'), t('chat.prompts2')]
  const replies = [t('chat.replies0'), t('chat.replies1'), t('chat.replies2')]
  return <div className={styles.chat}>
    <div className={styles.panelBar}><span><Sparkles size={17} /> {t('chat.title')}</span><span className={styles.tag}>{t('simulation')}</span></div>
    <div className={styles.taskChoices}>{prompts.map((p, i) => <button key={p} onClick={() => { manual.current = true; setTask(i) }} aria-pressed={task === i}>{p}</button>)}</div>
    <div className={styles.chatBody}><div className={styles.userMessage}>{[t('chat.requests0'), t('chat.requests1'), t('chat.requests2')][task]}</div><div className={styles.assistantMessage}><span className={styles.mimoInitial}>m.</span><p>{replies[task]}</p></div>
    <div className={styles.toolSteps}>{[t('chat.steps0'), t('chat.steps1'), t('chat.steps2')].map((step, i) => <div key={step} data-done={i <= task}><span>{i <= task ? <Check size={13} /> : i + 1}</span>{step}</div>)}</div>
    <div className={styles.chatResult} key={task}><Cover index={2} /><div><span className={styles.tag}>{[t('chat.tags0'), t('chat.tags1'), t('chat.tags2')][task]}</span><strong>{[t('chat.results0'), t('chat.results1'), t('chat.results2')][task]}</strong><small>{[t('chat.details0'), t('chat.details1'), t('chat.details2')][task]}</small></div></div></div>
    <div className={styles.composer}><span>{t('chat.composer')}</span><Send size={17} /></div>
  </div>
}

function DesignSimulation() {
  const t = useTranslations('landing.story')
  const [source, setSource] = useState(0)
  const [created, setCreated] = useState(false)
  return <div className={styles.design}>
    <div className={styles.panelBar}><span>{t('design.title')}</span><span className={styles.tag}>{t('simulation')}</span></div>
    <div className={styles.designControls}><button aria-pressed={!source} onClick={() => { setSource(0); setCreated(false) }}>{t('design.instagram')}</button><button aria-pressed={!!source} onClick={() => { setSource(1); setCreated(false) }}>{t('design.upload')}</button></div>
    <div className={styles.referenceLine}>{source ? t('design.file') : t('design.reference')}</div>
    <div className={styles.designCanvas} data-created={created}><div className={styles.referenceCard}><Cover index={source ? 2 : 0} /><span>{t('design.inspiration')}</span></div><div className={styles.designArrow}>↗</div><div className={styles.resultCard}><Cover index={source ? 3 : 1} /><span>{created ? t('design.ready') : t('design.direction')}</span></div></div>
    <div className={styles.designBottom}><p aria-live="polite">{created ? t('design.created') : t('design.hint')}</p><button className={styles.primary} onClick={() => setCreated(!created)}>{created ? t('design.reset') : t('design.create')}<Sparkles size={15} /></button></div>
  </div>
}

function DmSimulation() {
  const t = useTranslations('landing.story')
  const [keyword, setKeyword] = useState('INFO')
  const [sent, setSent] = useState(false)
  const matches = keyword.trim().toUpperCase() === 'INFO'
  return <div className={styles.dm}>
    <div className={styles.panelBar}><span><Instagram size={17} /> {t('dm.title')}</span><span className={styles.activeRule}><i /> {t('dm.rule')}</span></div>
    <div className={styles.dmRule}><span>{t('dm.condition')}</span><b>INFO</b><span>{t('dm.action')}</span></div>
    <div className={styles.commentPreview}><span className={styles.avatar}>N</span><div><b>nadia.bercerita</b><label htmlFor="demo-comment">{t('dm.comment')}</label><input id="demo-comment" value={keyword} maxLength={80} onChange={e => { setKeyword(e.target.value); setSent(false) }} /></div><span>♡</span></div>
    <button className={styles.runRule} onClick={() => setSent(true)}>{t('dm.test')} <ArrowUpRight size={16} /></button>
    <div className={styles.dmResult} aria-live="polite">{sent ? matches ? <><span><Check size={15} /> {t('dm.match')}</span><div className={styles.dmBubble}>{t('dm.reply')}<small>{t('dm.disclaimer')} <Check size={13} /></small></div></> : <p>{t('dm.mismatch')}</p> : <p>{t('dm.hint')}</p>}</div>
  </div>
}

// Mosio's live process tour: 440vh pin, quarter steps and continuous CSS layers.
export function ProductJourney({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing.story')
  const chapters = useChapters()
  const ref = useRef<HTMLDivElement>(null)
  const stepButtons = useRef<(HTMLButtonElement | null)[]>([])
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  useMotionValueEvent(scrollYProgress, 'change', value => {
    const next = value < .25 ? 0 : value < .5 ? 1 : value < .75 ? 2 : 3
    // Do not leave keyboard focus inside a layer that just became inert.
    const focused = document.activeElement
    if (motionEnabled && focused instanceof HTMLElement) {
      const layer = focused.closest<HTMLElement>('[data-chapter]')
      if (layer && ref.current?.contains(layer) && Number(layer.dataset.chapter) !== next) stepButtons.current[next]?.focus({ preventScroll: true })
    }
    setActive(next)
  })
  const select = (index: number) => {
    const root = ref.current
    if (!root) return
    if (!motionEnabled) {
      root.querySelector<HTMLElement>(`[data-chapter="${index}"]`)?.scrollIntoView({ block: 'start' })
      return
    }
    // Land on a fully revealed pose, not on the invisible quarter boundary.
    window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY + (index * .25 + .14) * Math.max(1, root.offsetHeight - window.innerHeight), behavior: 'smooth' })
  }
  return <motion.div ref={ref} id="fitur" className={styles.journey} data-motion={motionEnabled} style={{ '--sp': scrollYProgress } as MotionStyle}>
    <div className={styles.tourPin}>
      <div className={styles.journeyIntro}><span className={styles.eyebrow}>{t('journey.eyebrow')}</span><h2>{t('journey.title1')} {t('journey.title2')}</h2>
        <ol className={styles.tourSteps} aria-label={t('journey.guide')}>{chapters.map((chapter, index) => <li key={chapter.id} data-active={active === index} data-done={active > index}><button ref={node => { stepButtons.current[index] = node }} type="button" aria-current={active === index ? 'step' : undefined} aria-controls={chapter.id} onClick={() => select(index)}><b>{index + 1}</b><span>{chapter.label}</span></button></li>)}</ol>
        <div className={styles.progressTrack} aria-hidden="true"><motion.div style={{ scaleX: scrollYProgress }} /></div>
      </div>
      <div className={styles.tourStage}>
        {chapters.map((chapter, index) => <section key={chapter.id} id={chapter.id} data-chapter={index} className={styles.chapter} aria-labelledby={`${chapter.id}-title`} aria-hidden={motionEnabled && active !== index} inert={motionEnabled && active !== index}>
          <div className={styles.chapterCopy}><span className={styles.chapterLabel}>{chapter.label}</span><h2 id={`${chapter.id}-title`}>{chapter.title}</h2><p>{chapter.description}</p><span className={styles.tryHint}>↗ {chapter.detail}</span><Link href="/daftar">{t('start')} <ArrowUpRight size={17} /></Link></div>
          <div className={styles.simulation}>{index === 0 ? <CalendarSimulation /> : index === 1 ? <ChatSimulation progress={scrollYProgress} motionEnabled={motionEnabled} /> : index === 2 ? <DesignSimulation /> : <DmSimulation />}</div>
          <aside aria-label={t('journey.guide')} className={styles.guide}><MimoMascot size={74} still={!motionEnabled || active !== index} mood="smile" pulse={active === index ? active + 1 : 0} /><p>{chapter.note}</p></aside>
        </section>)}
      </div>
      <p className={styles.disclaimer}>{t('journey.disclaimer')}</p>
    </div>
  </motion.div>
}
