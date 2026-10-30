'use client'

/**
 * THESIS: Follow one brand's idea from a chat to a full content week.
 * OWN-WORLD: Incumbent Carousely indigo, lavender, mint, Bricolage and system UI.
 * STORY: See the workspace, try its illustrative tools, create an account.
 * FIRST VIEWPORT: Centered headline above a wide calendar with floating editorial posts.
 * FORM: User-approved dashboard-led page; scroll-linked depth, interactive feature demos.
 */
import Image from 'next/image'
import Link from 'next/link'
import { useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowDown, ArrowUpRight, CalendarDays, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ImageIcon, Layers3, Menu, MessageCircle, MousePointer2, Paperclip, Pause, Play, Plus, Send, Settings2, Sparkles, WandSparkles, X } from 'lucide-react'
import { CarouselyLogo } from '@/components/brand-mark'
import { InstagramIcon } from '@/components/instagram-icon'
import { SigapMascot } from '@/components/sigap-mascot'
import styles from './landing.module.css'

type Feature = 'sigap' | 'kalender' | 'balasan'
function Instagram({ size = 20 }: { size?: number }) {
  return <InstagramIcon width={size} height={size} />
}
const features = [
  { id: 'sigap' as const, icon: Sparkles, label: 'AI Sigap' },
  { id: 'kalender' as const, icon: CalendarDays, label: 'Kalender konten' },
  { id: 'balasan' as const, icon: MessageCircle, label: 'Balasan DM' },
]

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

const calendarPosts = [
  { day: 0, variant: 'green' as const, title: 'Tumbuh pelan-pelan', time: '09.00', type: 'Carousel' },
  { day: 2, variant: 'purple' as const, title: 'Ide kecil, dampak besar', time: '12.00', type: 'Carousel' },
  { day: 4, variant: 'peach' as const, title: 'Waktunya rehat sejenak', time: '16.00', type: 'Foto' },
]

function CalendarDemo({ interactive = false }: { interactive?: boolean }) {
  const [week, setWeek] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const dates = week === 0 ? [19, 20, 21, 22, 23] : [26, 27, 28, 29, 30]
  return <div className={styles.calendarDemo}>
    <div className={styles.calendarToolbar}>
      <div><h3>Kalender konten</h3><span>Semua ide punya waktunya.</span></div>
      <span className={styles.previewAccount}><Instagram size={13} /> akar.studio</span>
    </div>
    <div className={styles.calendarSubbar}>
      <strong>{week === 0 ? '19 – 23' : '26 – 30'} Oktober 2026</strong>
      {interactive ? <div className={styles.calendarArrows}>
        <button type="button" aria-label="Minggu sebelumnya" disabled={week === 0} onClick={() => { setWeek(0); setSelected(null) }}><ChevronLeft size={16} /></button>
        <button type="button" aria-label="Minggu berikutnya" disabled={week === 1} onClick={() => { setWeek(1); setSelected(null) }}><ChevronRight size={16} /></button>
      </div> : <span className={styles.weekPill}>Tampilan minggu <ChevronDown size={12} /></span>}
    </div>
    <div className={styles.calendarGrid}>
      {['Sen', 'Sel', 'Rab', 'Kam', 'Jum'].map((day, index) => {
        const post = calendarPosts.find((item) => item.day === index)
        return <div key={day} className={styles.calendarDay}>
          <div className={styles.dayLabel}><span>{day}</span><b className={index === 2 ? styles.activeDay : ''}>{dates[index]}</b></div>
          {post ? <button type="button" tabIndex={interactive ? 0 : -1} disabled={!interactive} className={styles.calendarPost} onClick={() => setSelected(selected === index ? null : index)} aria-expanded={interactive ? selected === index : undefined}>
            <ContentArt variant={post.variant} compact />
            <span className={styles.postTime}><Instagram size={11} /> {post.time} <span className={styles.statusDot} /></span>
            <strong>{post.title}</strong><span className={styles.postType}>{post.type}</span>
          </button> : <div className={styles.emptyDay}><Plus size={16} /><span>Ruang untuk ide baru</span></div>}
        </div>
      })}
    </div>
    {interactive && <div className={styles.calendarFeedback} aria-live="polite">{selected !== null ? <><Check size={15} /> “{calendarPosts.find((post) => post.day === selected)?.title}” dijadwalkan pada {dates[selected]} Oktober. Ini adalah contoh jadwal.</> : <><MousePointer2 size={15} /> Pilih konten untuk melihat jadwalnya, atau coba pindah minggu.</>}</div>}
  </div>
}

function DashboardPreview() {
  return <div className={styles.dashboard}>
    <div className={styles.windowBar}><div className={styles.windowDots}><i /><i /><i /></div><span>Ruang kerja kamu, lebih teratur.</span><span className={styles.demoLabel}>Preview produk</span></div>
    <div className={styles.dashboardBody}>
      <aside className={styles.demoSidebar} aria-label="Ilustrasi navigasi aplikasi">
        <CarouselyLogo size={25} />
        <div className={styles.demoWorkspace}><span>A</span><div><strong>Akar Studio</strong><small>Workspace brand</small></div><ChevronDown size={12} /></div>
        <div className={styles.demoNav}><span><Sparkles size={16} /> AI Sigap <i>AI</i></span><span className={styles.demoNavActive}><CalendarDays size={16} /> Kalender</span><span><Layers3 size={16} /> Buat konten</span><span><ImageIcon size={16} /> Aset</span><span><MessageCircle size={16} /> Balasan <b>3</b></span></div>
        <div className={styles.sidebarBottom}><Settings2 size={16} /> Pengaturan brand</div>
      </aside>
      <div className={styles.dashboardMain}><div className={styles.dashboardGreeting}><span>Selamat pagi, tim Akar <span aria-hidden="true">✺</span></span><span className={styles.newPost}><Plus size={13} /> Buat konten</span></div><CalendarDemo /></div>
    </div>
  </div>
}

function Hero({ motionEnabled }: { motionEnabled: boolean }) {
  const target = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target, offset: ['start start', 'end start'] })
  const dashboardY = useTransform(scrollYProgress, [0, 1], [0, -65])
  const floatY = useTransform(scrollYProgress, [0, 1], [0, -180])
  const floatRotate = useTransform(scrollYProgress, [0, 1], [-9, -17])
  const rightY = useTransform(scrollYProgress, [0, 1], [0, -115])
  return <section className={styles.hero} ref={target} aria-labelledby="hero-title">
    <div className={styles.heroCopy}>
      <motion.div initial={false} animate={motionEnabled ? { y: [12, 0] } : { y: 0 }} transition={{ duration: .65 }}>
        <h1 id="hero-title">Ide jalan.<br />Konten tayang.</h1>
        <p>Partner kreatif untuk Instagram kamu. Dari ide, bikin konten,<br className={styles.desktopBreak} /> sampai jadwal tayang. Beres di Carousely.</p>
        <div className={styles.heroActions}><Link href="/daftar" className={styles.primaryButton}>Mulai bikin konten <ArrowUpRight size={19} /></Link><a href="#fitur" className={styles.secondaryButton}><Play size={14} fill="currentColor" /> Lihat cara kerjanya</a></div>
        <div className={styles.heroNote}><Instagram size={14} /> Untuk akun Instagram Business & Creator</div>
      </motion.div>
    </div>
    <div className={styles.heroStage}>
      <svg className={styles.orbitLine} viewBox="0 0 1400 650" fill="none" aria-hidden="true"><path d="M-80 480C120 650 210 90 660 130S1260 540 1480 100" stroke="currentColor" strokeWidth="1.5" strokeDasharray="7 9" /></svg>
      <motion.div className={styles.floatingPost} style={motionEnabled ? { y: floatY, rotate: floatRotate } : { rotate: -9 }}><div className={styles.floatingPostHeader}><span className={styles.miniAvatar}>a.</span><b>akar.studio</b><Instagram size={14} /></div><ContentArt /><div className={styles.floatingPostFooter}><Layers3 size={14} /> Dari satu ide, jadi cerita.</div></motion.div>
      <motion.div className={styles.dashboardWrap} style={motionEnabled ? { y: dashboardY } : undefined}><DashboardPreview /></motion.div>
      <motion.div className={styles.floatingAi} style={motionEnabled ? { y: rightY, rotate: 6 } : { rotate: 6 }}><span className={styles.aiIcon}><Sparkles size={21} /></span><div><b>Sigap bantu mikirin.</b><span>Kamu tinggal pilih idenya.</span></div><div className={styles.ideaChips}><span>Tips ringan</span><span>Cerita brand</span><span>Behind the scenes</span></div></motion.div>
      <motion.div className={styles.floatingStatus} style={motionEnabled ? { y: floatY } : undefined}><span><Check size={19} /></span><div><b>Konten sudah terjadwal</b><small>Jumat, 23 Oktober · 16.00 WIB</small></div></motion.div>
    </div>
    <div className={styles.heroBottom}><span>Lebih banyak berkarya. Lebih sedikit pindah tab.</span><a href="#fitur" aria-label="Jelajahi fitur"><ArrowDown size={19} /></a></div>
  </section>
}

function SigapDemo() {
  const [topic, setTopic] = useState(0)
  const [pulse, setPulse] = useState(0)
  const prompts = ['Ide konten tanaman', 'Ide konten kedai kopi']
  return <div className={styles.sigapDemo}>
    <div className={styles.demoPanelHeader}><SigapMascot size={36} pulse={pulse} className="shrink-0" /><div><strong>Sigap</strong><small>Partner kreatif kamu</small></div><span className={styles.exampleTag}>Demo interaktif</span></div>
    <div className={styles.chatArea}>
      <div className={styles.userBubble}>{topic === 0 ? 'Bantu bikin ide carousel tentang merawat tanaman untuk pemula, ya.' : 'Bikin ide konten kedai kopi yang hangat dan nggak terlalu jualan.'}</div>
      <div className={styles.aiReply}><SigapMascot size={20} still mood="smile" /><div><strong>{topic === 0 ? 'Mulai dari hal kecil yang sering terlupa.' : 'Yuk, ceritakan momen di balik secangkir kopi.'}</strong><p>{topic === 0 ? 'Bagaimana kalau kita ajak audiens kenalan dengan kebutuhan tanamannya? Ini arah kontennya:' : 'Bukan cuma soal kopinya. Ajak audiens menikmati jeda kecil di tengah hari mereka.'}</p></div></div>
      <AnimatePresence mode="wait" initial={false}><motion.div key={topic} className={styles.aiResult} initial={{ opacity: .7, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}><ContentArt variant={topic === 0 ? 'green' : 'peach'} compact /><div><span>Konsep carousel · 5 slide</span><strong>{topic === 0 ? 'Tanaman pertamamu, cerita barumu.' : 'Secangkir kopi. Sedikit waktu untuk diri sendiri.'}</strong><p>{topic === 0 ? 'Kenali cahaya, atur air, dan beri ruang untuk tumbuh.' : 'Dari aroma pertama sampai obrolan terakhir.'}</p><span className={styles.resultCheck}><Check size={13} /> Siap kamu kembangkan</span></div></motion.div></AnimatePresence>
    </div>
    <div className={styles.promptOptions} role="group" aria-label="Pilih contoh percakapan">{prompts.map((prompt, index) => <button key={prompt} type="button" onClick={() => { setTopic(index); setPulse((n) => n + 1) }} aria-pressed={topic === index}>{prompt}<ArrowUpRight size={13} /></button>)}</div>
    <div className={styles.demoComposer}><Paperclip size={17} /><span>Pilih contoh ide di atas untuk mencoba</span><span><ArrowUpRight size={17} /></span></div>
  </div>
}

function InboxDemo() {
  const [sent, setSent] = useState(false)
  return <div className={styles.inboxDemo}>
    <div className={styles.demoPanelHeader}><MessageCircle size={20} /><div><strong>Balasan</strong><small>Percakapan Instagram</small></div><span className={styles.exampleTag}>Demo interaktif</span></div>
    <div className={styles.inboxPerson}><span className={styles.personAvatar}>N</span><div><strong>Nadia</strong><small>@nadia.bercerita</small></div><Instagram size={18} /></div>
    <div className={styles.inboxMessages}><span className={styles.chatDate}>Contoh percakapan</span><div className={styles.incomingBubble}>Halo, kak! Tanaman yang di postingan terakhir cocok buat di meja kerja nggak, ya?</div><div className={styles.replySuggestion}><span><Sparkles size={14} /> Saran balasan AI</span><p>Cocok, kak! Pilih tempat dengan cahaya tidak langsung, ya. Mau kami bantu pilihkan tanaman untuk meja kerjanya?</p></div><AnimatePresence>{sent && <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={styles.sentBubble}>Cocok, kak! Pilih tempat dengan cahaya tidak langsung, ya. Mau kami bantu pilihkan tanaman untuk meja kerjanya?<CheckCheck size={15} /></motion.div>}</AnimatePresence></div>
    <div className={styles.inboxBottom}><span aria-live="polite">{sent ? 'Balasan demo terkirim. Tidak ada DM sungguhan yang dikirim.' : 'Tinjau dulu. Kirim saat sudah sesuai.'}</span><button type="button" onClick={() => setSent(!sent)}>{sent ? 'Ulangi demo' : 'Coba kirim balasan'}{sent ? <WandSparkles size={15} /> : <Send size={15} />}</button></div>
  </div>
}

const featureCopy = {
  sigap: { title: 'Buntu ide?\nPanggil Sigap.', body: 'Punya bahan mentah, tapi belum tahu mau dibikin apa? Ajak Sigap ngobrol. Ubah topik sederhana jadi ide, caption, dan konsep konten yang terasa seperti brand kamu.', points: ['Mulai dari percakapan, bukan halaman kosong', 'Kembangkan ide jadi draf yang bisa diedit', 'Kamu yang pegang keputusan akhirnya'], link: 'Kenalan dengan Sigap' },
  kalender: { title: 'Satu minggu.\nSudah ada rencana.', body: 'Lihat gambaran besar konten kamu dalam satu kalender. Atur tanggal, cek status, dan siapkan jadwal publikasi tanpa harus mengingat semuanya sendiri.', points: ['Semua jadwal terlihat dalam satu tempat', 'Atur waktu tayang sesuai kebutuhanmu', 'Pantau status setiap konten'], link: 'Mulai atur jadwal' },
  balasan: { title: 'Obrolan masuk.\nHubungan terjaga.', body: 'Konten yang baik membuka percakapan. Kelola DM Instagram dan minta bantuan AI untuk menyusun balasan, sambil tetap menjaga sentuhan personal kamu.', points: ['Baca percakapan dari satu inbox', 'Susun balasan dengan bantuan AI', 'Tinjau setiap jawaban sebelum dikirim'], link: 'Rapikan percakapan' },
}

function FeatureShowcase() {
  const [active, setActive] = useState<Feature>('sigap')
  const tabPrefix = useId()
  const copy = featureCopy[active]
  return <section className={styles.features} id="fitur" aria-labelledby="features-title">
    <div className={styles.sectionHeading}><h2 id="features-title">Dari “posting apa, ya?”<br />jadi “sudah tayang, nih.”</h2><p>Satu alur kerja yang nyambung.<br />Supaya energimu habis untuk berkarya, bukan mengurus tab.</p></div>
    <div className={styles.featureTabs} role="tablist" aria-label="Jelajahi fitur Carousely">{features.map(({ id, icon: Icon, label }, index) => <button type="button" role="tab" id={`${tabPrefix}-${id}`} aria-selected={active === id} aria-controls={`${tabPrefix}-panel`} tabIndex={active === id ? 0 : -1} key={id} onClick={() => setActive(id)} onKeyDown={(event) => {
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
      <div className={`${styles.featureVisual} ${styles[`${active}Visual`]}`}><AnimatePresence mode="wait" initial={false}><motion.div key={active} initial={{ opacity: .65, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .22 }}>{active === 'sigap' ? <SigapDemo /> : active === 'kalender' ? <CalendarDemo interactive /> : <InboxDemo />}</motion.div></AnimatePresence></div>
    </div>
    <p className={styles.demoDisclaimer}>Semua isi preview adalah data ilustrasi. Coba tombol dan pilihan di dalam demo.</p>
  </section>
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
      <article><span className={styles.stepNumber}>2</span><div><h3>Olah ide bareng Sigap</h3><p>Mulai dari topik atau aset yang sudah ada. Kembangkan, edit, dan buat jadi versimu.</p></div><motion.span className={styles.stepSpark} style={motionEnabled ? { rotate } : undefined} aria-hidden="true"><Sparkles size={31} /></motion.span></article>
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

export function LandingPage({ pricing }: { pricing: ReactNode }) {
  const reduceMotion = useReducedMotion()
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
    <main id="main-content"><Hero motionEnabled={motionEnabled} />
      <div className={styles.capabilities}><span><Sparkles size={18} /> Ide & caption AI</span><span><Layers3 size={18} /> Kreasi konten</span><span><CalendarDays size={18} /> Jadwal publikasi</span><span><MessageCircle size={18} /> Inbox Instagram</span></div>
      <section className={styles.partners} aria-labelledby="partners-title"><h2 id="partners-title">Dipercaya oleh partner kami</h2><p>Brand yang sudah jalan bareng Carousely.</p><div>{partners.map(({ name, ...logo }) => <span key={name}><Image {...logo} alt={name} /></span>)}</div></section>
      <FeatureShowcase /><Workflow motionEnabled={motionEnabled} />
      <section className={styles.brandSection} aria-labelledby="brand-title"><div className={styles.brandCanvas}><div className={styles.brandCanvasTop}><span className={styles.miniAvatar}>a.</span><span>Satu brand. Banyak cerita.</span><Layers3 size={19} /></div><div className={styles.brandPosts}>{(['green', 'purple', 'peach'] as const).map((variant, index) => <motion.div key={variant} initial={false} whileInView={motionEnabled ? { rotate: index === 0 ? -7 : index === 2 ? 7 : 0, y: index === 1 ? -15 : 0 } : undefined} viewport={{ once: true, amount: .5 }} transition={{ duration: .7, delay: index * .1 }}><ContentArt variant={variant} /></motion.div>)}</div></div><div className={styles.brandText}><h2 id="brand-title">Tetap terasa kamu.<br />Di setiap postingan.</h2><p>AI membantu merangkai. Kamu yang memberi karakter. Simpan identitas brand, pakai asetmu sendiri, dan ubah setiap draf sampai benar-benar pas.</p><Link href="/daftar" className={styles.textLink}>Bawa brand kamu ke Carousely <ArrowUpRight size={18} /></Link></div></section>
      {pricing}
      <section className={styles.faq} id="faq" aria-labelledby="faq-title"><div><CircleHelp size={29} /><h2 id="faq-title">Masih penasaran?</h2><p>Kenalan sedikit lagi<br />sebelum mulai berkarya.</p></div><div className={styles.faqList}>{faqs.map(({ q, a }) => <details key={q}><summary>{q}<Plus size={19} /></summary><p>{a}</p></details>)}</div></section>
      <section className={styles.finalCta} aria-labelledby="cta-title"><div className={styles.ctaIllustration} aria-hidden="true"><BotanicalArt light /></div><div><h2 id="cta-title">Ide berikutnya,<br />kita bikin bareng?</h2><p>Kasih ruang untuk kreativitasmu. Carousely bantu sisanya.</p><Link href="/daftar" className={styles.ctaButton}>Mulai dengan Carousely <ArrowUpRight size={20} /></Link></div><svg className={styles.ctaSpark} viewBox="0 0 100 100" aria-hidden="true"><path d="M50 3v94M3 50h94M17 17l66 66M17 83l66-66" stroke="currentColor" strokeWidth="9" /></svg></section>
    </main>
    <footer className={styles.footer}><div><CarouselyLogo size={29} /><p>Teman kerja untuk ide-ide kamu.</p></div><div className={styles.footerLinks}><Link href="/privasi">Kebijakan privasi</Link><Link href="/masuk">Masuk</Link><button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused || reduceMotion ? <Play size={14} /> : <Pause size={14} />}{reduceMotion ? 'Gerak minimal sistem' : paused ? 'Aktifkan animasi' : 'Jeda animasi'}</button></div><span className={styles.copyright}>© 2026 Carousely</span></footer>
  </div></MotionConfig>
}
