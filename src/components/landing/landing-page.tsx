'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { MotionConfig, motion, useScroll, useTransform } from 'framer-motion'
import { ArrowUpRight, CalendarDays, CircleHelp, Layers3, Menu, MessageCircle, Pause, Play, Plus, Send, Sparkles, X } from 'lucide-react'
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
  return <div className={`${styles.contentArt} ${styles[variant]} ${compact ? styles.compactArt : ''}`}>
    <span className={styles.artBrand}>akar studio</span>
    {variant === 'green' ? <><strong>Tumbuh<br />pelan-pelan.</strong><BotanicalArt /><span className={styles.artFoot}>Ruang kecil. Cerita besar.</span></> : variant === 'purple' ? <><strong>Ide kecil,<br />dampak<br />besar.</strong><div className={styles.artAsterisk} aria-hidden="true">✳</div><span className={styles.artFoot}>Catatan kreatif untuk harimu.</span></> : <><strong>Rehat dulu.<br />Lanjut lagi.</strong><svg className={styles.cupArt} viewBox="0 0 200 150" fill="none" aria-hidden="true"><ellipse cx="100" cy="131" rx="72" ry="10" fill="#c48060" opacity=".25" /><path d="M139 56h14c34 0 32 46 0 46h-15" stroke="#a55336" strokeWidth="13" /><path d="M47 47h98v49c0 47-98 47-98 0V47Z" fill="#a55336" /><ellipse cx="96" cy="47" rx="49" ry="13" fill="#e9bba0" /><ellipse cx="96" cy="47" rx="39" ry="8" fill="#583c31" /><path d="M82 27c-12-16 15-14 4-28M108 28c-12-16 15-14 4-28" stroke="#a55336" strokeWidth="3" strokeLinecap="round" /></svg><span className={styles.artFoot}>Beri jeda untuk ide berikutnya.</span></>}
  </div>
}

function Workflow({ motionEnabled }: { motionEnabled: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const x = useTransform(scrollYProgress, [0, 1], [36, -36])
  const rotate = useTransform(scrollYProgress, [0, 1], [-4, 4])
  return <section className={styles.workflow} id="cara-kerja" ref={ref} aria-labelledby="workflow-title">
    <div className={styles.workflowIntro}><h2 id="workflow-title">Bukan ganti gayamu.<br />Bantu nemuin ritmemu.</h2><p>Carousely mengurus alurnya.<br />Ceritanya tetap punya kamu.</p><div className={styles.workflowDoodle} aria-hidden="true"><svg viewBox="0 0 160 80" fill="none"><path d="M9 12C62-5 100 15 92 41C84 67 40 58 59 37C78 16 139 30 149 68M129 56l22 14 1-25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div></div>
    <div className={styles.workflowSteps}>
      <article><span className={styles.stepNumber}>1</span><div><h3>Kenalkan brand kamu</h3><p>Simpan karakter, gaya bahasa, dan bahan konten. Biar setiap ide punya arah yang sama.</p></div><span className={styles.brandSwatches} aria-hidden="true"><i /><i /><i /></span></article>
      <article><span className={styles.stepNumber}>2</span><div><h3>Olah ide bareng Mimo</h3><p>Mulai dari topik atau aset yang sudah ada. Kembangkan, edit, dan buat jadi versimu.</p></div><motion.span className={styles.stepSpark} style={motionEnabled ? { rotate } : undefined} aria-hidden="true"><Sparkles size={31} /></motion.span></article>
      <article><span className={styles.stepNumber}>3</span><div><h3>Atur jadwal. Lanjut berkarya.</h3><p>Tinjau konten, tentukan waktu tayang, dan ikuti percakapan yang datang setelahnya.</p></div><motion.span className={styles.stepSend} style={motionEnabled ? { x } : undefined} aria-hidden="true"><Send size={30} /></motion.span></article>
    </div>
  </section>
}

const partners = [
  { name: 'RE/MAX', src: '/partners/remax.svg', width: 220, height: 60 },
  { name: 'SUME', src: '/partners/sume.png', width: 1745, height: 431 },
]

const faqs = [
  { q: 'Carousely cocok untuk siapa?', a: 'Untuk pemilik UMKM, kreator, dan pengelola media sosial yang ingin menyiapkan konten serta mengelola Instagram dari satu tempat. Kamu bisa mulai dari ide sederhana, foto produk, atau bahan konten yang sudah ada.' },
  { q: 'Akun Instagram apa yang bisa dihubungkan?', a: 'Gunakan akun Instagram Business atau Creator. Hubungkan akun melalui alur resmi Instagram di pengaturan Carousely dan berikan izin yang diperlukan untuk fitur publikasi serta pesan.' },
  { q: 'Apakah konten AI langsung dipublikasikan?', a: 'Tidak. Hasil AI adalah bahan kerja yang bisa kamu tinjau dan edit. Kamu tetap menentukan konten mana yang dipakai dan kapan konten dijadwalkan untuk tayang.' },
  { q: 'Bagaimana cara mulai memakai Carousely?', a: 'Buat akun, ikuti proses langganan di aplikasi, lalu lengkapi brand dan hubungkan Instagram kamu. Informasi paket dan biaya tersedia pada langkah langganan sebelum pembayaran.' },
  { q: 'Apakah preview di halaman ini terhubung ke akun asli?', a: 'Preview ini adalah demo interaktif dengan data ilustrasi. Mencoba ide, melihat jadwal, atau mengirim balasan di demo tidak membuat konten maupun mengirim pesan ke akun Instagram sungguhan.' },
]

const motionQuery = '(prefers-reduced-motion: reduce)'
function subscribeMotion(callback: () => void) {
  const query = matchMedia(motionQuery)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

export function LandingPage({ pricing }: { pricing: ReactNode }) {
  const reduceMotion = useSyncExternalStore(subscribeMotion, () => matchMedia(motionQuery).matches, () => false)
  const [paused, setPaused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const motionEnabled = !reduceMotion && !paused
  return <MotionConfig reducedMotion={motionEnabled ? 'user' : 'always'} transition={motionEnabled ? undefined : { duration: 0 }}><div className={styles.landing}>
    <a href="#main-content" className={styles.skipLink}>Langsung ke konten</a>
    <header className={styles.header}>
      <Link href="/" aria-label="Carousely beranda"><CarouselyLogo size={34} /></Link>
      <nav className={styles.desktopNav} aria-label="Navigasi utama"><a href="#fitur">Fitur</a><a href="#cara-kerja">Cara kerja</a><a href="#harga">Harga</a><a href="#faq">Tanya jawab</a></nav>
      <div className={styles.headerActions}><Link href="/masuk" className={styles.loginLink}>Masuk</Link><Link href="/daftar" className={styles.navCta}>Mulai sekarang <ArrowUpRight size={16} /></Link><button type="button" className={styles.menuToggle} aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'} aria-expanded={menuOpen} aria-controls="landing-mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></div>
      {menuOpen && <nav id="landing-mobile-menu" className={styles.mobileMenu} aria-label="Navigasi seluler" onKeyDown={(event) => { if (event.key === 'Escape') { setMenuOpen(false); document.querySelector<HTMLButtonElement>(`.${styles.menuToggle}`)?.focus() } }}><a href="#fitur" onClick={() => setMenuOpen(false)}>Fitur</a><a href="#cara-kerja" onClick={() => setMenuOpen(false)}>Cara kerja</a><a href="#harga" onClick={() => setMenuOpen(false)}>Harga</a><a href="#faq" onClick={() => setMenuOpen(false)}>Tanya jawab</a><Link href="/masuk">Masuk ke akun</Link></nav>}
    </header>
    <main id="main-content"><GalleryHero motionEnabled={motionEnabled} />
      <div className={styles.capabilities}><span><Sparkles size={18} /> Ide & caption AI</span><span><Layers3 size={18} /> Kreasi konten</span><span><CalendarDays size={18} /> Jadwal publikasi</span><span><MessageCircle size={18} /> Inbox Instagram</span></div>
      <section className={styles.partners} aria-labelledby="partners-title"><h2 id="partners-title">Dipercaya oleh partner kami</h2><p>Brand yang sudah jalan bareng Carousely.</p><div>{partners.map(({ name, ...logo }) => <span key={name}><Image {...logo} alt={name} /></span>)}</div></section>
      <ProductJourney motionEnabled={motionEnabled} /><Workflow motionEnabled={motionEnabled} />
      <section className={styles.brandSection} aria-labelledby="brand-title"><div className={styles.brandCanvas}><div className={styles.brandCanvasTop}><span className={styles.miniAvatar}>a.</span><span>Satu brand. Banyak cerita.</span><Layers3 size={19} /></div><div className={styles.brandPosts}>{(['green', 'purple', 'peach'] as const).map((variant, index) => <motion.div key={variant} initial={false} whileInView={motionEnabled ? { rotate: index === 0 ? -7 : index === 2 ? 7 : 0, y: index === 1 ? -15 : 0 } : undefined} viewport={{ once: true, amount: .5 }} transition={{ duration: .7, delay: index * .1 }}><ContentArt variant={variant} /></motion.div>)}</div></div><div className={styles.brandText}><h2 id="brand-title">Tetap terasa kamu.<br />Di setiap postingan.</h2><p>AI membantu merangkai. Kamu yang memberi karakter. Simpan identitas brand, pakai asetmu sendiri, dan ubah setiap draf sampai benar-benar pas.</p><Link href="/daftar" className={styles.textLink}>Bawa brand kamu ke Carousely <ArrowUpRight size={18} /></Link></div></section>
      {pricing}
      <section className={styles.faq} id="faq" aria-labelledby="faq-title"><div><CircleHelp size={29} /><h2 id="faq-title">Masih penasaran?</h2><p>Kenalan sedikit lagi<br />sebelum mulai berkarya.</p></div><div className={styles.faqList}>{faqs.map(({ q, a }) => <details key={q}><summary>{q}<Plus size={19} /></summary><p>{a}</p></details>)}</div></section>
      <section className={styles.finalCta} aria-labelledby="cta-title"><div className={styles.ctaIllustration} aria-hidden="true"><BotanicalArt light /></div><div><h2 id="cta-title">Ide berikutnya,<br />kita bikin bareng?</h2><p>Kasih ruang untuk kreativitasmu. Carousely bantu sisanya.</p><Link href="/daftar" className={styles.ctaButton}>Mulai dengan Carousely <ArrowUpRight size={20} /></Link></div><svg className={styles.ctaSpark} viewBox="0 0 100 100" aria-hidden="true"><path d="M50 3v94M3 50h94M17 17l66 66M17 83l66-66" stroke="currentColor" strokeWidth="9" /></svg></section>
    </main>
    <footer className={styles.footer}><div><CarouselyLogo size={29} /><p>Teman kerja untuk ide-ide kamu.</p></div><div className={styles.footerLinks}><Link href="/privasi">Kebijakan privasi</Link><Link href="/masuk">Masuk</Link><button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused || reduceMotion ? <Play size={14} /> : <Pause size={14} />}{reduceMotion ? 'Gerak minimal sistem' : paused ? 'Aktifkan animasi' : 'Jeda animasi'}</button></div><span className={styles.copyright}>© 2026 Carousely</span></footer>
  </div></MotionConfig>
}
