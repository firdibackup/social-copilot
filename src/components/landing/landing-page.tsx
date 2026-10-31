'use client'

import { useTranslations } from 'next-intl'
import { LocaleToggle } from '@/components/locale-toggle'
import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { MotionConfig, motion, useScroll, useTransform } from 'framer-motion'
import { ArrowUpRight, CircleHelp, Layers3, Menu, Pause, Play, Plus, Send, Sparkles, X } from 'lucide-react'
import { CarouselyLogo } from '@/components/brand-mark'
import styles from './landing.module.css'
import { GalleryHero, ProductJourney } from './homepage-story'

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


const motionQuery = '(prefers-reduced-motion: reduce)'
function subscribeMotion(callback: () => void) {
  const query = matchMedia(motionQuery)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

export function LandingPage({ pricing }: { pricing: ReactNode }) {
  const t = useTranslations('landing')
  const faqs = [
    { q: t('faq.audienceQuestion'), a: t('faq.audienceAnswer') },
    { q: t('faq.accountQuestion'), a: t('faq.accountAnswer') },
    { q: t('faq.aiQuestion'), a: t('faq.aiAnswer') },
    { q: t('faq.startQuestion'), a: t('faq.startAnswer') },
    { q: t('faq.demoQuestion'), a: t('faq.demoAnswer') },
  ]
  const reduceMotion = useSyncExternalStore(subscribeMotion, () => matchMedia(motionQuery).matches, () => false)
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
    <main id="main-content"><GalleryHero motionEnabled={motionEnabled} />
      <section className={styles.partners} aria-labelledby="partners-title"><h2 id="partners-title">{t('partners.title')}</h2><p>{t('partners.subtitle')}</p><div>{partners.map(({ name, ...logo }) => <span key={name}><Image {...logo} alt={name} /></span>)}</div></section>
      <ProductJourney motionEnabled={motionEnabled} /><Workflow motionEnabled={motionEnabled} />
      <section className={styles.brandSection} aria-labelledby="brand-title"><div className={styles.brandCanvas}><div className={styles.brandCanvasTop}><span className={styles.miniAvatar}>a.</span><span>{t('brand.canvas')}</span><Layers3 size={19} /></div><div className={styles.brandPosts}>{(['green', 'purple', 'peach'] as const).map((variant, index) => <motion.div key={variant} initial={false} whileInView={motionEnabled ? { rotate: index === 0 ? -7 : index === 2 ? 7 : 0, y: index === 1 ? -15 : 0 } : undefined} viewport={{ once: true, amount: .5 }} transition={{ duration: .7, delay: index * .1 }}><ContentArt variant={variant} /></motion.div>)}</div></div><div className={styles.brandText}><h2 id="brand-title">{t('brand.title1')}<br />{t('brand.title2')}</h2><p>{t('brand.body')}</p><Link href="/daftar" className={styles.textLink}>{t('brand.link')} <ArrowUpRight size={18} /></Link></div></section>
      {pricing}
      <section className={styles.faq} id="faq" aria-labelledby="faq-title"><div><CircleHelp size={29} /><h2 id="faq-title">{t('faq.title')}</h2><p>{t('faq.subtitle1')}<br />{t('faq.subtitle2')}</p></div><div className={styles.faqList}>{faqs.map(({ q, a }) => <details key={q}><summary>{q}<Plus size={19} /></summary><p>{a}</p></details>)}</div></section>
      <section className={styles.finalCta} aria-labelledby="cta-title"><div className={styles.ctaIllustration} aria-hidden="true"><BotanicalArt light /></div><div><h2 id="cta-title">{t('cta.title1')}<br />{t('cta.title2')}</h2><p>{t('cta.body')}</p><Link href="/daftar" className={styles.ctaButton}>{t('cta.start')} <ArrowUpRight size={20} /></Link></div><svg className={styles.ctaSpark} viewBox="0 0 100 100" aria-hidden="true"><path d="M50 3v94M3 50h94M17 17l66 66M17 83l66-66" stroke="currentColor" strokeWidth="9" /></svg></section>
    </main>
    <footer className={styles.footer}><div><CarouselyLogo size={29} /><p>{t('footer.tagline')}</p></div><div className={styles.footerLinks}><Link href="/privasi">{t('footer.privacy')}</Link><Link href="/masuk">{t('nav.login')}</Link><button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused || reduceMotion ? <Play size={14} /> : <Pause size={14} />}{reduceMotion ? t('footer.reducedMotion') : paused ? t('footer.enableMotion') : t('footer.pauseMotion')}</button></div><span className={styles.copyright}>© 2026 Carousely</span></footer>
  </div></MotionConfig>
}
