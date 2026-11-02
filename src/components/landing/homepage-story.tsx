'use client'

import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import styles from './homepage-story.module.css'
import { RealWork, TrialPrompt } from './real-work'

export const names = ['01-beauty-skincare', '02-haircare', '03-cafe', '04-bakery', '05-restaurant', '06-architecture', '07-legal-service', '08-finance-service', '09-hr-recruitment', '10-digital-agency', '11-property', '12-wellness', '13-education', '14-automotive', '15-modest-fashion', '16-travel', '17-saas-technology', '18-fitness', '19-wedding-organizer', '20-umkm-branding']
function useCoverLabels() {
  const t = useTranslations('landing.story')
  return [t('covers.label0'), t('covers.label1'), t('covers.label2'), t('covers.label3'), t('covers.label4'), t('covers.label5'), t('covers.label6'), t('covers.label7'), t('covers.label8'), t('covers.label9'), t('covers.label10'), t('covers.label11'), t('covers.label12'), t('covers.label13'), t('covers.label14'), t('covers.label15'), t('covers.label16'), t('covers.label17'), t('covers.label18'), t('covers.label19')]
}
function Cover({ index, className = '', priority = false }: { index: number; className?: string; priority?: boolean }) {
  const t = useTranslations('landing.story')
  const labels = useCoverLabels()
  return <Image className={className} src={`/covers/${names[index]}.webp`} alt={t('covers.alt', { category: labels[index] })} width={1122} height={1402} sizes="(max-width: 760px) 160px, 240px" unoptimized priority={priority} />
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
  return <section id="konten" className={styles.showcase} data-motion={motionEnabled} aria-labelledby="showcase-title">
    <span className={styles.eyebrow}>{t('eyebrow')}</span>
    <h2 id="showcase-title">{t('title')}</h2>
    <RealWork motionEnabled={motionEnabled} />
    <div className={styles.samplesHead}><span>{t('samplesLabel')}</span></div>
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
    <TrialPrompt motionEnabled={motionEnabled} />
  </section>
}
