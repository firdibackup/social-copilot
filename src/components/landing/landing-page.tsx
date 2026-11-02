'use client'

import { useTranslations } from 'next-intl'
import { LocaleToggle } from '@/components/locale-toggle'
import Link from 'next/link'
import Image from 'next/image'
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import { ArrowUpRight, Check, CircleHelp, Menu, Pause, Play, Plus, X } from 'lucide-react'
import { CarouselyLogo } from '@/components/brand-mark'
import { SiteFooter } from '@/components/site-footer'
import styles from './landing.module.css'
import { ContentShowcase } from './homepage-story'
import { OrbitHero } from './orbit-hero'
import { FeatureTour } from './feature-tour'
import { MimoTour } from './mimo-tour'
import { Testimonials } from './testimonials'

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
      <nav className={styles.desktopNav} aria-label={t('nav.main')}><a href="#fitur">{t('nav.features')}</a><a href="#tur-fitur">{t('nav.workflow')}</a><a href="#harga">{t('nav.pricing')}</a><a href="#faq">{t('nav.faq')}</a></nav>
      <div className={styles.headerActions}><LocaleToggle variant="landing" className={styles.desktopLocaleToggle} /><Link href="/masuk" className={styles.loginLink}>{t('nav.login')}</Link><Link href="/daftar" className={styles.navCta}>{t('nav.start')} <ArrowUpRight size={16} /></Link><button type="button" className={styles.menuToggle} aria-label={menuOpen ? t('nav.close') : t('nav.open')} aria-expanded={menuOpen} aria-controls="landing-mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></div>
      {menuOpen && <nav id="landing-mobile-menu" className={styles.mobileMenu} aria-label={t('nav.mobile')} onKeyDown={(event) => { if (event.key === 'Escape') { setMenuOpen(false); document.querySelector<HTMLButtonElement>(`.${styles.menuToggle}`)?.focus() } }}><a href="#fitur" onClick={() => setMenuOpen(false)}>{t('nav.features')}</a><a href="#tur-fitur" onClick={() => setMenuOpen(false)}>{t('nav.workflow')}</a><a href="#harga" onClick={() => setMenuOpen(false)}>{t('nav.pricing')}</a><a href="#faq" onClick={() => setMenuOpen(false)}>{t('nav.faq')}</a><Link href="/masuk">{t('nav.accountLogin')}</Link><LocaleToggle variant="landing" className={styles.mobileLocaleToggle} /></nav>}
    </header>
    <main id="main-content">
      <OrbitHero paused={paused} reduceMotion={reduceMotion} />
      <FeatureTour motionEnabled={motionEnabled} />
      <ContentShowcase motionEnabled={motionEnabled} />
      <Testimonials motionEnabled={motionEnabled} />
      {pricing}
      <section className={styles.faq} id="faq" aria-labelledby="faq-title"><div><CircleHelp size={29} /><h2 id="faq-title">{t('faq.title')}</h2><p>{t('faq.subtitle1')}<br />{t('faq.subtitle2')}</p></div><div className={styles.faqList}>{faqs.map(({ q, a }) => <details key={q}><summary>{q}<Plus size={19} /></summary><p>{a}</p></details>)}</div></section>
      <section className={styles.finalCta} aria-labelledby="cta-title">
        <div className={styles.ctaCopy}>
          <span className={styles.ctaEyebrow}>{t('cta.eyebrow')}</span>
          <h2 id="cta-title">{t('cta.title1')}<br /><span className={styles.ctaAccent}>{t('cta.title2')}</span></h2>
          <p>{t('cta.body')}</p>
          <div className={styles.ctaActions}>
            <Link href="/daftar" className={styles.ctaButton}>{t('cta.start')} <ArrowUpRight size={19} aria-hidden="true" /></Link>
            <span className={styles.ctaNote}><Check size={15} aria-hidden="true" />{t('cta.note')}</span>
          </div>
        </div>
        {/* Three real sample covers, fanned like a fresh batch of posts. Decorative only. */}
        <div className={styles.ctaStack} aria-hidden="true">
          {['03-cafe', '01-beauty-skincare', '11-property'].map(name => <Image key={name} src={`/covers/${name}.webp`} alt="" width={1122} height={1402} sizes="(max-width: 760px) 140px, 220px" unoptimized />)}
          <span className={styles.ctaChip}><Check size={14} strokeWidth={2.6} />{t('cta.chip')}</span>
        </div>
      </section>
    </main>
    <SiteFooter className={styles.footer} extra={<button type="button" className={styles.motionToggle} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused || reduceMotion ? <Play size={14} /> : <Pause size={14} />}{reduceMotion ? t('footer.reducedMotion') : paused ? t('footer.enableMotion') : t('footer.pauseMotion')}</button>} />
    <MimoTour enabled={motionEnabled} />
  </div></MotionConfig>
}
