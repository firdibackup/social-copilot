'use client'

import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { InstagramFillIcon } from '@/components/brand-icons'
import styles from './testimonials.module.css'

/** Real clients quoted on the landing page. Copy lives in `landing.testimonials.<key>` (both locales). */
export const testimonials = [
  { key: 'remax', name: 'RE/MAX Indonesia', handle: 'remaxindonesia', tone: 'lavender', logo: { src: '/partners/remax.svg', width: 220, height: 60 } },
  { key: 'sume', name: 'SUME', handle: 'sume.group', tone: 'mint', logo: { src: '/partners/sume.png', width: 1745, height: 431 } },
] as const

export function Testimonials({ motionEnabled }: { motionEnabled: boolean }) {
  const t = useTranslations('landing.testimonials')
  const mark = (chunks: React.ReactNode) => <mark>{chunks}</mark>

  return <section className={styles.testimonials} id="testimoni" aria-labelledby="testimonials-title">
    <div className={styles.head}>
      <span className={styles.eyebrow}>{t('eyebrow')}</span>
      <h2 id="testimonials-title">{t('title')}</h2>
    </div>

    <div className={styles.grid}>
      {testimonials.map((client, index) => <motion.figure
        key={client.key}
        className={styles.card}
        data-tone={client.tone}
        initial={motionEnabled ? { opacity: 0, y: 28 } : false}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: .35 }}
        transition={{ duration: motionEnabled ? .7 : 0, delay: motionEnabled ? index * .12 : 0, ease: [.22, 1, .36, 1] }}
      >
        <span className={styles.quoteMark} aria-hidden="true">“</span>
        <blockquote className={styles.quote}>
          <p>{client.key === 'remax' ? t.rich('remax.quote', { mark }) : t.rich('sume.quote', { mark })}</p>
        </blockquote>
        <figcaption className={styles.author}>
          <span className={styles.logo}>
            <Image src={client.logo.src} alt="" width={client.logo.width} height={client.logo.height} sizes="96px" unoptimized />
          </span>
          <span className={styles.who}>
            <strong>{client.name}</strong>
            <a href={`https://www.instagram.com/${client.handle}/`} target="_blank" rel="noopener noreferrer" aria-label={t('handleLabel', { name: client.name, handle: client.handle })}>
              <InstagramFillIcon size={13} />@{client.handle}<ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </span>
        </figcaption>
      </motion.figure>)}
    </div>
  </section>
}
