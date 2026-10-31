'use client'

/**
 * THESIS: Follow one brand's idea from a chat to a full content week.
 * OWN-WORLD: Incumbent Carousely indigo, lavender, mint, Bricolage and system UI.
 * STORY: See the workspace, try its illustrative tools, create an account.
 * FIRST VIEWPORT: Centered headline above a wide calendar with floating editorial posts.
 * FORM: User-approved dashboard-led page; scroll-linked depth, interactive feature demos.
 */
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import Link from 'next/link'
import { useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowDown, ArrowUpRight, CalendarDays, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ImageIcon, Layers3, Menu, MessageCircle, MousePointer2, Paperclip, Pause, Play, Plus, Send, Settings2, ShieldCheck, Sparkles, WandSparkles, X } from 'lucide-react'
import { CarouselyLogo } from '@/components/brand-mark'
import { InstagramFillIcon, MetaFillIcon, ThreadsFillIcon } from '@/components/brand-icons'
import { InstagramIcon } from '@/components/instagram-icon'
import { MimoMascot } from '@/components/mimo-mascot'
import { LocaleToggle } from '@/components/locale-toggle'
import styles from './landing.module.css'

type Feature = 'mimo' | 'kalender' | 'balasan'
function Instagram({ size = 20 }: { size?: number }) {
  return <InstagramIcon width={size} height={size} />
}

function BotanicalArt({ light = false }: { light?: boolean }) {
  return (
    <svg viewBox="0 0 220 190" fill="none" aria-hidden="true" className={styles.botanical}>
      <path d="M112 184C104 144 113 102 142 41M111 148C80 130 60 102 50 60M118 118C143 103 162 88 180 62" stroke={light ? '#e9e5ff' : '#315b48'} strokeWidth="3" strokeLinecap="round" />
      <path d="M140 49C112 42 107 16 134 9C156 4 165 26 140 49ZM125 83C98 81 86 60 101 46C119 32 143 54 125 83ZM115 117C87 117 78 94 91 82C109 68 127 93 115 117ZM61 88C35 88 19 70 29 55C44 36 65 59 61 88ZM82 120C54 122 40 108 48 91C58 72 83 94 82 120ZM148 98C141 71 162 48 177 58C191 68 173 91 148 98ZM130 142C133 111 161 105 169 122C174 139 151 149 130 142Z" fill={light ? '#b8f3d6' : '#58876b'} />
      <ellipse cx="110" cy="182" rx="46" ry="5" fill={light ? '#ffffff' : '#315b48'} opacity=".12" />
    </svg>
  )
}

function ContentArt({ variant = 'green', compact = false }: { variant?: 'green' | 'purple' | 'peach'; compact?: boolean }) {
  const t = useTranslations('landing')
  return <div className={`${styles.contentArt} ${styles[variant]} ${compact ? styles.compactArt : ''}`}>
    <span className={styles.artBrand}>akar studio</span>
    {variant === 'green' ? <><strong>{t('art.greenTitle1')}<br />{t('art.greenTitle2')}</strong><BotanicalArt /><span className={styles.artFoot}>{t('art.greenFooter')}</span></> : variant === 'purple' ? <><strong>{t('art.purpleTitle1')}<br />{t('art.purpleTitle2')}<br />{t('art.purpleTitle3')}</strong><div className={styles.artAsterisk} aria-hidden="true">✳</div><span className={styles.artFoot}>{t('art.purpleFooter')}</span></> : <><strong>{t('art.peachTitle1')}<br />{t('art.peachTitle2')}</strong><svg className={styles.cupArt} viewBox="0 0 200 150" fill="none" aria-hidden="true"><ellipse cx="100" cy="131" rx="72" ry="10" fill="#c48060" opacity=".25" /><path d="M139 56h14c34 0 32 46 0 46h-15" stroke="#a55336" strokeWidth="13" /><path d="M47 47h98v49c0 47-98 47-98 0V47Z" fill="#a55336" /><ellipse cx="96" cy="47" rx="49" ry="13" fill="#e9bba0" /><ellipse cx="96" cy="47" rx="39" ry="8" fill="#583c31" /><path d="M82 27c-12-16 15-14 4-28M108 28c-12-16 15-14 4-28" stroke="#a55336" strokeWidth="3" strokeLinecap="round" /></svg><span className={styles.artFoot}>{t('art.peachFooter')}</span></>}
  </div>
}


function CalendarDemo({ interactive = false }: { interactive?: boolean }) {
  const t = useTranslations('landing')
  const calendarPosts = [
    { day: 0, variant: 'green' as const, title: t('calendar.greenTitle'), time: t('calendar.morning'), type: 'Carousel' },
    { day: 2, variant: 'purple' as const, title: t('calendar.purpleTitle'), time: t('calendar.noon'), type: 'Carousel' },
    { day: 4, variant: 'peach' as const, title: t('calendar.peachTitle'), time: t('calendar.afternoon'), type: t('calendar.photo') },
  ]
  const [week, setWeek] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const dates = week === 0 ? [19, 20, 21, 22, 23] : [26, 27, 28, 29, 30]
  return <div className={styles.calendarDemo}>
    <div className={styles.calendarToolbar}>
      <div><h3>{t('calendar.title')}</h3><span>{t('calendar.subtitle')}</span></div>
      <span className={styles.previewAccount}><Instagram size={13} /> akar.studio</span>
    </div>
    <div className={styles.calendarSubbar}>
      <strong>{t('calendar.range', { range: week === 0 ? '19 – 23' : '26 – 30' })}</strong>
      {interactive ? <div className={styles.calendarArrows}>
        <button type="button" aria-label={t('calendar.previous')} disabled={week === 0} onClick={() => { setWeek(0); setSelected(null) }}><ChevronLeft size={16} /></button>
        <button type="button" aria-label={t('calendar.next')} disabled={week === 1} onClick={() => { setWeek(1); setSelected(null) }}><ChevronRight size={16} /></button>
      </div> : <span className={styles.weekPill}>{t('calendar.weekView')} <ChevronDown size={12} /></span>}
    </div>
    <div className={styles.calendarGrid}>
      {[t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri')].map((day, index) => {
        const post = calendarPosts.find((item) => item.day === index)
        return <div key={day} className={styles.calendarDay}>
          <div className={styles.dayLabel}><span>{day}</span><b className={index === 2 ? styles.activeDay : ''}>{dates[index]}</b></div>
          {post ? <button type="button" tabIndex={interactive ? 0 : -1} disabled={!interactive} className={styles.calendarPost} onClick={() => setSelected(selected === index ? null : index)} aria-expanded={interactive ? selected === index : undefined}>
            <ContentArt variant={post.variant} compact />
            <span className={styles.postTime}><Instagram size={11} /> {post.time} <span className={styles.statusDot} /></span>
            <strong>{post.title}</strong><span className={styles.postType}>{post.type}</span>
          </button> : <div className={styles.emptyDay}><Plus size={16} /><span>{t('calendar.empty')}</span></div>}
        </div>
      })}
    </div>
    {interactive && <div className={styles.calendarFeedback} aria-live="polite">{selected !== null ? <><Check size={15} /> {t('calendar.feedback', { title: calendarPosts.find((post) => post.day === selected)?.title ?? '', day: dates[selected] })}</> : <><MousePointer2 size={15} /> {t('calendar.hint')}</>}</div>}
  </div>
}

function DashboardPreview() {
  const t = useTranslations('landing')
  return <div className={styles.dashboard}>
    <div className={styles.windowBar}><div className={styles.windowDots}><i /><i /><i /></div><span>{t('dashboard.tagline')}</span><span className={styles.demoLabel}>{t('dashboard.preview')}</span></div>
    <div className={styles.dashboardBody}>
      <aside className={styles.demoSidebar} aria-label={t('dashboard.navigation')}>
        <CarouselyLogo size={25} />
        <div className={styles.demoWorkspace}><span>A</span><div><strong>Akar Studio</strong><small>{t('dashboard.workspace')}</small></div><ChevronDown size={12} /></div>
        <div className={styles.demoNav}><span><Sparkles size={16} /> AI Mimo <i>AI</i></span><span className={styles.demoNavActive}><CalendarDays size={16} /> {t('dashboard.calendar')}</span><span><Layers3 size={16} /> {t('dashboard.create')}</span><span><ImageIcon size={16} /> {t('dashboard.assets')}</span><span><MessageCircle size={16} /> {t('dashboard.replies')} <b>3</b></span></div>
        <div className={styles.sidebarBottom}><Settings2 size={16} /> {t('dashboard.settings')}</div>
      </aside>
      <div className={styles.dashboardMain}><div className={styles.dashboardGreeting}><span>{t('dashboard.greeting')} <span aria-hidden="true">✺</span></span><span className={styles.newPost}><Plus size={13} /> {t('dashboard.create')}</span></div><CalendarDemo /></div>
    </div>
  </div>
}

function Hero({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing')
  const target = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target, offset: ['start start', 'end start'] })
  const dashboardY = useTransform(scrollYProgress, [0, 1], [0, -65])
  const floatY = useTransform(scrollYProgress, [0, 1], [0, -180])
  const floatRotate = useTransform(scrollYProgress, [0, 1], [-9, -17])
  const rightY = useTransform(scrollYProgress, [0, 1], [0, -115])
  return <section className={styles.hero} ref={target} aria-labelledby="hero-title">
    <div className={styles.heroCopy}>
      <motion.div initial={false} animate={motionEnabled ? { y: [12, 0] } : { y: 0 }} transition={{ duration: .65 }}>
        <div className={styles.trustBadge}>
          <ShieldCheck size={16} strokeWidth={2.2} className={styles.trustShield} aria-hidden="true" />
          <span>{t('hero.trust')}</span>
          <span className={styles.trustDivider} aria-hidden="true" />
          <span className={styles.trustLogos} role="img" aria-label="Meta, Instagram, Threads">
            {/* The Carousely mark's sweep, violet through blue to aqua, shared by the three logos. */}
            <svg width="0" height="0" aria-hidden="true" className={styles.trustGradientDefs}>
              <defs>
                <linearGradient id="trust-logo-gradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#c04dff" />
                  <stop offset="45%" stopColor="#4f46ff" />
                  <stop offset="100%" stopColor="#22c9e6" />
                </linearGradient>
              </defs>
            </svg>
            <MetaFillIcon size={18} />
            <InstagramFillIcon size={16} />
            <ThreadsFillIcon size={16} />
          </span>
        </div>
        <h1 id="hero-title">{t('hero.title1')}<br />{t('hero.title2')}</h1>
        <p>{t.rich('hero.body', { br: () => <br className={styles.desktopBreak} /> })}</p>
        <div className={styles.heroActions}><Link href="/daftar" className={styles.primaryButton}>{t('hero.start')} <ArrowUpRight size={19} /></Link><a href="#fitur" className={styles.secondaryButton}><Play size={14} fill="currentColor" /> {t('hero.how')}</a></div>
        <div className={styles.heroNote}><Instagram size={14} /> {t('hero.accountNote')}</div>
      </motion.div>
    </div>
    <div className={styles.heroStage}>
      <svg className={styles.orbitLine} viewBox="0 0 1400 650" fill="none" aria-hidden="true"><path d="M-80 480C120 650 210 90 660 130S1260 540 1480 100" stroke="currentColor" strokeWidth="1.5" strokeDasharray="7 9" /></svg>
      <motion.div className={styles.floatingPost} style={motionEnabled ? { y: floatY, rotate: floatRotate } : { rotate: -9 }}><div className={styles.floatingPostHeader}><span className={styles.miniAvatar}>a.</span><b>akar.studio</b><Instagram size={14} /></div><ContentArt /><div className={styles.floatingPostFooter}><Layers3 size={14} /> {t('hero.postFooter')}</div></motion.div>
      <motion.div className={styles.dashboardWrap} style={motionEnabled ? { y: dashboardY } : undefined}><DashboardPreview /></motion.div>
      <motion.div className={styles.floatingAi} style={motionEnabled ? { y: rightY, rotate: 6 } : { rotate: 6 }}><span className={styles.aiIcon}><Sparkles size={21} /></span><div><b>{t('hero.mimoTitle')}</b><span>{t('hero.mimoBody')}</span></div><div className={styles.ideaChips}><span>{t('hero.tips')}</span><span>{t('hero.brandStories')}</span><span>{t('hero.behindScenes')}</span></div></motion.div>
      <motion.div className={styles.floatingStatus} style={motionEnabled ? { y: floatY } : undefined}><span><Check size={19} /></span><div><b>{t('hero.scheduled')}</b><small>{t('hero.scheduledAt')}</small></div></motion.div>
    </div>
    <div className={styles.heroBottom}><span>{t('hero.bottom')}</span><a href="#fitur" aria-label={t('hero.explore')}><ArrowDown size={19} /></a></div>
  </section>
}

function MimoDemo() {
  const t = useTranslations('landing')
  const [topic, setTopic] = useState(0)
  const [pulse, setPulse] = useState(0)
  const prompts = [t('mimo.plantPrompt'), t('mimo.coffeePrompt')]
  return <div className={styles.mimoDemo}>
    <div className={styles.demoPanelHeader}><MimoMascot size={36} pulse={pulse} className="shrink-0" /><div><strong>Mimo</strong><small>{t('mimo.partner')}</small></div><span className={styles.exampleTag}>{t('demo.interactive')}</span></div>
    <div className={styles.chatArea}>
      <div className={styles.userBubble}>{topic === 0 ? t('mimo.plantRequest') : t('mimo.coffeeRequest')}</div>
      <div className={styles.aiReply}><MimoMascot size={20} still mood="smile" /><div><strong>{topic === 0 ? t('mimo.plantReplyTitle') : t('mimo.coffeeReplyTitle')}</strong><p>{topic === 0 ? t('mimo.plantReply') : t('mimo.coffeeReply')}</p></div></div>
      <AnimatePresence mode="wait" initial={false}><motion.div key={topic} className={styles.aiResult} initial={{ opacity: .7, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}><ContentArt variant={topic === 0 ? 'green' : 'peach'} compact /><div><span>{t('mimo.concept')}</span><strong>{topic === 0 ? t('mimo.plantResultTitle') : t('mimo.coffeeResultTitle')}</strong><p>{topic === 0 ? t('mimo.plantResult') : t('mimo.coffeeResult')}</p><span className={styles.resultCheck}><Check size={13} /> {t('mimo.ready')}</span></div></motion.div></AnimatePresence>
    </div>
    <div className={styles.promptOptions} role="group" aria-label={t('mimo.choose')}>{prompts.map((prompt, index) => <button key={prompt} type="button" onClick={() => { setTopic(index); setPulse((n) => n + 1) }} aria-pressed={topic === index}>{prompt}<ArrowUpRight size={13} /></button>)}</div>
    <div className={styles.demoComposer}><Paperclip size={17} /><span>{t('mimo.composer')}</span><span><ArrowUpRight size={17} /></span></div>
  </div>
}

function InboxDemo() {
  const t = useTranslations('landing')
  const [sent, setSent] = useState(false)
  return <div className={styles.inboxDemo}>
    <div className={styles.demoPanelHeader}><MessageCircle size={20} /><div><strong>{t('dashboard.replies')}</strong><small>{t('inbox.subtitle')}</small></div><span className={styles.exampleTag}>{t('demo.interactive')}</span></div>
    <div className={styles.inboxPerson}><span className={styles.personAvatar}>N</span><div><strong>Nadia</strong><small>@nadia.bercerita</small></div><Instagram size={18} /></div>
    <div className={styles.inboxMessages}><span className={styles.chatDate}>{t('inbox.example')}</span><div className={styles.incomingBubble}>{t('inbox.incoming')}</div><div className={styles.replySuggestion}><span><Sparkles size={14} /> {t('inbox.suggestion')}</span><p>{t('inbox.reply')}</p></div><AnimatePresence>{sent && <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={styles.sentBubble}>{t('inbox.reply')}<CheckCheck size={15} /></motion.div>}</AnimatePresence></div>
    <div className={styles.inboxBottom}><span aria-live="polite">{sent ? t('inbox.sent') : t('inbox.review')}</span><button type="button" onClick={() => setSent(!sent)}>{sent ? t('inbox.reset') : t('inbox.send')}{sent ? <WandSparkles size={15} /> : <Send size={15} />}</button></div>
  </div>
}


function FeatureShowcase() {
  const t = useTranslations('landing')
  const featureCopy = {
    mimo: { title: t('features.mimo.title'), body: t('features.mimo.body'), points: [t('features.mimo.point1'), t('features.mimo.point2'), t('features.mimo.point3')], link: t('features.mimo.link') },
    kalender: { title: t('features.kalender.title'), body: t('features.kalender.body'), points: [t('features.kalender.point1'), t('features.kalender.point2'), t('features.kalender.point3')], link: t('features.kalender.link') },
    balasan: { title: t('features.balasan.title'), body: t('features.balasan.body'), points: [t('features.balasan.point1'), t('features.balasan.point2'), t('features.balasan.point3')], link: t('features.balasan.link') },
  }
  const features = [
    { id: 'mimo' as const, icon: Sparkles, label: 'AI Mimo' },
    { id: 'kalender' as const, icon: CalendarDays, label: t('calendar.title') },
    { id: 'balasan' as const, icon: MessageCircle, label: t('features.repliesTab') },
  ]
  const [active, setActive] = useState<Feature>('mimo')
  const tabPrefix = useId()
  const copy = featureCopy[active]
  return <section className={styles.features} id="fitur" aria-labelledby="features-title">
    <div className={styles.sectionHeading}><h2 id="features-title">{t('features.title1')}<br />{t('features.title2')}</h2><p>{t('features.subtitle1')}<br />{t('features.subtitle2')}</p></div>
    <div className={styles.featureTabs} role="tablist" aria-label={t('features.explore')}>{features.map(({ id, icon: Icon, label }, index) => <button type="button" role="tab" id={`${tabPrefix}-${id}`} aria-selected={active === id} aria-controls={`${tabPrefix}-panel`} tabIndex={active === id ? 0 : -1} key={id} onClick={() => setActive(id)} onKeyDown={(event) => {
      let next = index
      if (event.key === 'ArrowRight') next = (index + 1) % features.length
      else if (event.key === 'ArrowLeft') next = (index + features.length - 1) % features.length
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = features.length - 1
      else return
      event.preventDefault(); setActive(features[next].id); document.getElementById(`${tabPrefix}-${features[next].id}`)?.focus()
    }}><Icon size={17} />{label}{active === id && <motion.span layoutId="feature-underline" className={styles.tabUnderline} />}</button>)}</div>
    <div className={styles.featurePanel} role="tabpanel" id={`${tabPrefix}-panel`} aria-labelledby={`${tabPrefix}-${active}`} tabIndex={0}>
      <div className={styles.featureText}><h3>{copy.title}</h3><p>{copy.body}</p><ul>{copy.points.map((point) => <li key={point}><Check size={16} />{point}</li>)}</ul><Link href="/daftar" className={styles.textLink}>{copy.link}<ArrowUpRight size={17} /></Link></div>
      <div className={`${styles.featureVisual} ${styles[`${active}Visual`]}`}><AnimatePresence mode="wait" initial={false}><motion.div key={active} initial={{ opacity: .65, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .22 }}>{active === 'mimo' ? <MimoDemo /> : active === 'kalender' ? <CalendarDemo interactive /> : <InboxDemo />}</motion.div></AnimatePresence></div>
    </div>
    <p className={styles.demoDisclaimer}>{t('features.disclaimer')}</p>
  </section>
}

function Workflow({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing')
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const x = useTransform(scrollYProgress, [0, 1], [36, -36])
  const rotate = useTransform(scrollYProgress, [0, 1], [-4, 4])
  return <section className={styles.workflow} id="cara-kerja" ref={ref} aria-labelledby="workflow-title">
    <div className={styles.workflowIntro}><h2 id="workflow-title">{t('workflow.title1')}<br />{t('workflow.title2')}</h2><p>{t('workflow.subtitle1')}<br />{t('workflow.subtitle2')}</p><div className={styles.workflowDoodle} aria-hidden="true"><svg viewBox="0 0 160 80" fill="none"><path d="M9 12C62-5 100 15 92 41C84 67 40 58 59 37C78 16 139 30 149 68M129 56l22 14 1-25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div></div>
    <div className={styles.workflowSteps}>
      <article><span className={styles.stepNumber}>1</span><div><h3>{t('workflow.brandTitle')}</h3><p>{t('workflow.brandBody')}</p></div><span className={styles.brandSwatches} aria-hidden="true"><i /><i /><i /></span></article>
      <article><span className={styles.stepNumber}>2</span><div><h3>{t('workflow.mimoTitle')}</h3><p>{t('workflow.mimoBody')}</p></div><motion.span className={styles.stepSpark} style={motionEnabled ? { rotate } : undefined} aria-hidden="true"><Sparkles size={31} /></motion.span></article>
      <article><span className={styles.stepNumber}>3</span><div><h3>{t('workflow.scheduleTitle')}</h3><p>{t('workflow.scheduleBody')}</p></div><motion.span className={styles.stepSend} style={motionEnabled ? { x } : undefined} aria-hidden="true"><Send size={30} /></motion.span></article>
    </div>
  </section>
}

const partners = [
  { name: 'RE/MAX', src: '/partners/remax.svg', width: 220, height: 60 },
  { name: 'SUME', src: '/partners/sume.png', width: 1745, height: 431 },
]


export function LandingPage({ pricing }: { pricing: ReactNode }) {
  const t = useTranslations('landing')
  const faqs = [
    { q: t('faq.audienceQuestion'), a: t('faq.audienceAnswer') },
    { q: t('faq.accountQuestion'), a: t('faq.accountAnswer') },
    { q: t('faq.aiQuestion'), a: t('faq.aiAnswer') },
    { q: t('faq.startQuestion'), a: t('faq.startAnswer') },
    { q: t('faq.demoQuestion'), a: t('faq.demoAnswer') },
  ]
  const reduceMotion = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const motionEnabled = !reduceMotion && !paused
  return <MotionConfig reducedMotion={motionEnabled ? 'user' : 'always'} transition={motionEnabled ? undefined : { duration: 0 }}><div className={styles.landing}>
    <a href="#main-content" className={styles.skipLink}>{t('nav.skip')}</a>
    <header className={styles.header}>
      <Link href="/" aria-label={t('nav.home')}><CarouselyLogo size={34} /></Link>
      <nav className={styles.desktopNav} aria-label={t('nav.main')}><a href="#fitur">{t('nav.features')}</a><a href="#cara-kerja">{t('nav.workflow')}</a><a href="#harga">{t('nav.pricing')}</a><a href="#faq">{t('nav.faq')}</a></nav>
      <div className={styles.headerActions}><LocaleToggle variant="landing" className={styles.desktopLocaleToggle} /><Link href="/masuk" className={styles.loginLink}>{t('nav.login')}</Link><Link href="/daftar" className={styles.navCta}>{t('nav.start')} <ArrowUpRight size={16} /></Link><button type="button" className={styles.menuToggle} aria-label={menuOpen ? t('nav.close') : t('nav.open')} aria-expanded={menuOpen} aria-controls="landing-mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></div>
      {menuOpen && <nav id="landing-mobile-menu" className={styles.mobileMenu} aria-label={t('nav.mobile')} onKeyDown={(event) => { if (event.key === 'Escape') { setMenuOpen(false); document.querySelector<HTMLButtonElement>(`.${styles.menuToggle}`)?.focus() } }}><a href="#fitur" onClick={() => setMenuOpen(false)}>{t('nav.features')}</a><a href="#cara-kerja" onClick={() => setMenuOpen(false)}>{t('nav.workflow')}</a><a href="#harga" onClick={() => setMenuOpen(false)}>{t('nav.pricing')}</a><a href="#faq" onClick={() => setMenuOpen(false)}>{t('nav.faq')}</a><Link href="/masuk">{t('nav.accountLogin')}</Link><LocaleToggle variant="landing" className={styles.mobileLocaleToggle} /></nav>}
    </header>
    <main id="main-content"><Hero motionEnabled={motionEnabled} />
      <div className={styles.capabilities}><span><Sparkles size={18} /> {t('capabilities.ideas')}</span><span><Layers3 size={18} /> {t('capabilities.create')}</span><span><CalendarDays size={18} /> {t('capabilities.schedule')}</span><span><MessageCircle size={18} /> {t('capabilities.inbox')}</span></div>
      <section className={styles.partners} aria-labelledby="partners-title"><h2 id="partners-title">{t('partners.title')}</h2><p>{t('partners.subtitle')}</p><div>{partners.map(({ name, ...logo }) => <span key={name}><Image {...logo} alt={name} /></span>)}</div></section>
      <FeatureShowcase /><Workflow motionEnabled={motionEnabled} />
      <section className={styles.brandSection} aria-labelledby="brand-title"><div className={styles.brandCanvas}><div className={styles.brandCanvasTop}><span className={styles.miniAvatar}>a.</span><span>{t('brand.canvas')}</span><Layers3 size={19} /></div><div className={styles.brandPosts}>{(['green', 'purple', 'peach'] as const).map((variant, index) => <motion.div key={variant} initial={false} whileInView={motionEnabled ? { rotate: index === 0 ? -7 : index === 2 ? 7 : 0, y: index === 1 ? -15 : 0 } : undefined} viewport={{ once: true, amount: .5 }} transition={{ duration: .7, delay: index * .1 }}><ContentArt variant={variant} /></motion.div>)}</div></div><div className={styles.brandText}><h2 id="brand-title">{t('brand.title1')}<br />{t('brand.title2')}</h2><p>{t('brand.body')}</p><Link href="/daftar" className={styles.textLink}>{t('brand.link')} <ArrowUpRight size={18} /></Link></div></section>
      {pricing}
      <section className={styles.faq} id="faq" aria-labelledby="faq-title"><div><CircleHelp size={29} /><h2 id="faq-title">{t('faq.title')}</h2><p>{t('faq.subtitle1')}<br />{t('faq.subtitle2')}</p></div><div className={styles.faqList}>{faqs.map(({ q, a }) => <details key={q}><summary>{q}<Plus size={19} /></summary><p>{a}</p></details>)}</div></section>
      <section className={styles.finalCta} aria-labelledby="cta-title"><div className={styles.ctaIllustration} aria-hidden="true"><BotanicalArt light /></div><div><h2 id="cta-title">{t('cta.title1')}<br />{t('cta.title2')}</h2><p>{t('cta.body')}</p><Link href="/daftar" className={styles.ctaButton}>{t('cta.start')} <ArrowUpRight size={20} /></Link></div><svg className={styles.ctaSpark} viewBox="0 0 100 100" aria-hidden="true"><path d="M50 3v94M3 50h94M17 17l66 66M17 83l66-66" stroke="currentColor" strokeWidth="9" /></svg></section>
    </main>
    <footer className={styles.footer}><div><CarouselyLogo size={29} /><p>{t('footer.tagline')}</p></div><div className={styles.footerLinks}><Link href="/privasi">{t('footer.privacy')}</Link><Link href="/masuk">{t('nav.login')}</Link><button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused || reduceMotion ? <Play size={14} /> : <Pause size={14} />}{reduceMotion ? t('footer.reducedMotion') : paused ? t('footer.enableMotion') : t('footer.pauseMotion')}</button></div><span className={styles.copyright}>© 2026 Carousely</span></footer>
  </div></MotionConfig>
}
