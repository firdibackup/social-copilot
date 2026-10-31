'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'framer-motion'
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Pause, Play, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { InstagramIcon } from '@/components/instagram-icon'
import { MimoMascot } from '@/components/mimo-mascot'
import styles from './homepage-story.module.css'

function Instagram({ size }: { size: number }) { return <InstagramIcon width={size} height={size} /> }

const names = ['01-beauty-skincare', '02-haircare', '03-cafe', '04-bakery', '05-restaurant', '06-architecture', '07-legal-service', '08-finance-service', '09-hr-recruitment', '10-digital-agency', '11-property', '12-wellness', '13-education', '14-automotive', '15-modest-fashion', '16-travel', '17-saas-technology', '18-fitness', '19-wedding-organizer', '20-umkm-branding']
const labels = ['Perawatan kulit', 'Perawatan rambut', 'Kedai kopi', 'Toko roti', 'Restoran', 'Arsitektur', 'Jasa hukum', 'Keuangan', 'Rekrutmen', 'Agensi digital', 'Properti', 'Kesehatan', 'Pendidikan', 'Otomotif', 'Busana', 'Perjalanan', 'Teknologi', 'Kebugaran', 'Pernikahan', 'Brand UMKM']
function Cover({ index, className = '', priority = false }: { index: number; className?: string; priority?: boolean }) {
  return <Image className={className} src={`/covers/${names[index]}.webp`} alt={`Contoh desain carousel ${labels[index]}`} width={1122} height={1402} sizes="(max-width: 760px) 160px, 240px" unoptimized priority={priority} />
}

export function GalleryHero({ motionEnabled }: { motionEnabled: boolean }) {
  const [paused, setPaused] = useState(false)
  return <section className={styles.hero} aria-labelledby="hero-title">
    <div className={styles.heroCopy}>
      <span className={styles.eyebrow}><ShieldCheck size={16} /> Integrasi API resmi <span>·</span> Instagram & Threads</span>
      <h1 id="hero-title">Social media aktif.<br /><span>Kamu tetap fokus.</span></h1>
      <p>Dari ide pertama sampai konten tayang.<br />Partner AI yang mengerti brand, mengatur jadwal,<br className={styles.desktopBreak} /> dan menjaga percakapan tetap jalan.</p>
      <div className={styles.actions}><Link href="/daftar" className={styles.primary}>Mulai dengan Carousely <ArrowUpRight size={18} /></Link><a href="#fitur" className={styles.secondary}>Jelajahi cara kerjanya <span>↓</span></a></div>
      <span className={styles.smallNote}>Untuk kreator, UMKM, dan tim yang punya banyak cerita.</span>
    </div>
    <div className={styles.gallery} data-paused={paused || !motionEnabled} aria-label="Galeri 20 contoh carousel">
      {[0, 1].map(row => <div className={`${styles.galleryTrack} ${row ? styles.reverse : ''}`} key={row}>{[0, 1].map(copy => <div className={styles.galleryGroup} key={copy} aria-hidden={copy === 1 ? true : undefined}>{names.slice(row * 10, row * 10 + 10).map((name, i) => <figure key={name}><Cover index={row * 10 + i} priority={row === 0 && i < 6} /><figcaption>{labels[row * 10 + i]}</figcaption></figure>)}</div>)}</div>)}
    </div>
    <div className={styles.galleryFoot}><span>Banyak bidang. Satu ruang untuk berkarya.</span><button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused || !motionEnabled ? <Play size={14} /> : <Pause size={14} />}{!motionEnabled ? 'Galeri tanpa animasi' : paused ? 'Putar galeri' : 'Jeda galeri'}</button></div>
  </section>
}

const chapters = [
  { id: 'jadwal', label: 'Kalender & penjadwalan', title: 'Seminggu terencana.\nPikiran lebih lega.', description: 'Susun ritme posting dalam satu kalender. Tinjau kontennya, tentukan waktunya, lalu kembali ke hal yang perlu perhatianmu.', note: 'Kamu tentukan waktunya. Aku bantu rapikan jadwalnya.', detail: 'Pilih tanggal untuk mencoba jadwal.' },
  { id: 'asisten', label: 'Chatbot Mimo', title: 'Satu percakapan.\nBanyak yang beres.', description: 'Riset Instagram, cari arah konten, buat draf, sampai susun jadwal. Ceritakan kebutuhanmu ke Mimo, tanpa pindah-pindah alat.', note: 'Dari riset sampai jadwal, cukup ceritakan maumu ke aku.', detail: 'Pilih tugas untuk melihat alur Mimo.' },
  { id: 'desain', label: 'Kreasi dari referensi', title: 'Ada referensi?\nJadikan versi kamu.', description: 'Mulai dari inspirasi Instagram atau gambar yang kamu unggah. Kembangkan jadi carousel dengan karakter dan cerita brand sendiri.', note: 'Bawa referensimu. Kita olah jadi desain yang terasa kamu.', detail: 'Ganti sumber, lalu coba buat desain.' },
  { id: 'auto-dm', label: 'Auto DM', title: 'Komentar masuk.\nPercakapan berlanjut.', description: 'Ajak audiens mengambil langkah berikutnya. Siapkan kata pemicu dan pesan, lalu kirim informasi lewat DM secara otomatis.', note: 'Ada yang komentar “INFO”? Aku bantu lanjutkan lewat DM.', detail: 'Coba kata pemicu, tanpa mengirim DM sungguhan.' },
]

function CalendarSimulation() {
  const [day, setDay] = useState(2)
  const [week, setWeek] = useState(0)
  return <div className={styles.calendar}>
    <div className={styles.panelBar}><span><i /> Kalender konten</span><span className={styles.account}><Instagram size={14} /> studio.kamu</span></div>
    <div className={styles.calendarTitle}><div><small>RENCANA YANG SIAP JALAN</small><h3>Oktober 2026</h3></div><div className={styles.arrows}><button aria-label="Minggu sebelumnya" disabled={!week} onClick={() => setWeek(0)}><ChevronLeft size={18} /></button><button aria-label="Minggu berikutnya" disabled={!!week} onClick={() => setWeek(1)}><ChevronRight size={18} /></button></div></div>
    <div className={styles.days}>{['Sen', 'Sel', 'Rab', 'Kam', 'Jum'].map((name, i) => <button key={name} aria-pressed={day === i} onClick={() => setDay(i)}><span>{name}</span><b>{19 + week * 7 + i}</b><i /></button>)}</div>
    <div className={styles.schedulePost}><Cover index={day === 0 ? 0 : day === 1 ? 3 : day === 2 ? 2 : day === 3 ? 11 : 19} /><div><span className={styles.tag}>CAROUSEL · 5 SLIDE</span><h4>{['Rutinitas kecil, kulit terawat.', 'Cerita hangat dari oven.', 'Secangkir ide untuk harimu.', 'Saatnya memberi jeda.', 'Brand kecil, cerita besar.'][day]}</h4><p>Caption dan desain siap ditinjau.</p><span className={styles.confirm}><Check size={14} /> Siap dijadwalkan</span></div></div>
    <div className={styles.scheduleFooter} aria-live="polite"><span><b>{19 + week * 7 + day} Oktober</b> · 09.00 WIB</span><span>Instagram <Check size={14} /></span></div>
  </div>
}

function ChatSimulation({ progress, motionEnabled }: { progress: MotionValue<number>; motionEnabled: boolean }) {
  const [task, setTask] = useState(0)
  const manual = useRef(false)
  useMotionValueEvent(progress, 'change', value => {
    if (motionEnabled && !manual.current) setTask(value < .42 ? 0 : value < .62 ? 1 : 2)
  })
  const prompts = ['Riset Instagram', 'Buat konten', 'Susun jadwal']
  const replies = ['Aku rangkum pola konten akun referensi, lalu pilih sudut cerita yang cocok untuk brand kamu.', 'Dari hasil riset tadi, ini konsep carousel kopi yang bisa kamu tinjau dan kembangkan.', 'Drafnya masuk rencana mingguan. Tinjau dulu sebelum kamu menyetujui jadwal tayangnya.']
  return <div className={styles.chat}>
    <div className={styles.panelBar}><span><Sparkles size={17} /> Ruang ngobrol Mimo</span><span className={styles.tag}>SIMULASI</span></div>
    <div className={styles.taskChoices}>{prompts.map((p, i) => <button key={p} onClick={() => { manual.current = true; setTask(i) }} aria-pressed={task === i}>{p}</button>)}</div>
    <div className={styles.chatBody}><div className={styles.userMessage}>{['Riset konten Instagram untuk kedai kopi, lalu cari ide yang cocok buat brand-ku.', 'Buat carousel dari ide kopi tadi, ya. Gayanya hangat dan nggak terlalu jualan.', 'Susun jadwal konten ini untuk minggu depan.'][task]}</div><div className={styles.assistantMessage}><span className={styles.mimoInitial}>m.</span><p>{replies[task]}</p></div>
    <div className={styles.toolSteps}>{['Riset referensi', 'Kembangkan konten', 'Rencanakan tayang'].map((step, i) => <div key={step} data-done={i <= task}><span>{i <= task ? <Check size={13} /> : i + 1}</span>{step}</div>)}</div>
    <div className={styles.chatResult} key={task}><Cover index={2} /><div><span className={styles.tag}>{['ARAH KONTEN', 'DRAF CAROUSEL', 'JADWAL DRAF'][task]}</span><strong>{['Cerita di balik secangkir kopi', 'Bukan sekadar kopi pagi.', 'Senin · 09.00 WIB'][task]}</strong><small>{['Edukasi ringan · cerita produk · keseharian', '5 slide · caption siap diedit', 'Menunggu tinjauan kamu'][task]}</small></div></div></div>
    <div className={styles.composer}><span>Pilih tugas di atas untuk mencoba Mimo</span><Send size={17} /></div>
  </div>
}

function DesignSimulation() {
  const [source, setSource] = useState(0)
  const [created, setCreated] = useState(false)
  return <div className={styles.design}>
    <div className={styles.panelBar}><span>Studio kreasi</span><span className={styles.tag}>SIMULASI</span></div>
    <div className={styles.designControls}><button aria-pressed={!source} onClick={() => { setSource(0); setCreated(false) }}>Referensi Instagram</button><button aria-pressed={!!source} onClick={() => { setSource(1); setCreated(false) }}>Contoh unggahan</button></div>
    <div className={styles.referenceLine}>{source ? 'gambar-produk-kopi.jpg · contoh file' : 'instagram.com/p/contoh · contoh referensi'}</div>
    <div className={styles.designCanvas} data-created={created}><div className={styles.referenceCard}><Cover index={source ? 2 : 0} /><span>Inspirasi awal</span></div><div className={styles.designArrow}>↗</div><div className={styles.resultCard}><Cover index={source ? 3 : 1} /><span>{created ? 'Desain siap ditinjau' : 'Arah desain baru'}</span></div></div>
    <div className={styles.designBottom}><p aria-live="polite">{created ? 'Draf demo siap. Ubah teks, warna, dan urutan slide sesuai brand.' : 'Ambil arah visualnya. Bukan menyalin ceritanya.'}</p><button className={styles.primary} onClick={() => setCreated(!created)}>{created ? 'Ulangi simulasi' : 'Coba buat desain'}<Sparkles size={15} /></button></div>
  </div>
}

function DmSimulation() {
  const [keyword, setKeyword] = useState('INFO')
  const [sent, setSent] = useState(false)
  const matches = keyword.trim().toUpperCase() === 'INFO'
  return <div className={styles.dm}>
    <div className={styles.panelBar}><span><Instagram size={17} /> Komentar → DM</span><span className={styles.activeRule}><i /> Aturan contoh</span></div>
    <div className={styles.dmRule}><span>JIKA KOMENTAR BERISI</span><b>INFO</b><span>KIRIM PESAN PRODUK</span></div>
    <div className={styles.commentPreview}><span className={styles.avatar}>N</span><div><b>nadia.bercerita</b><label htmlFor="demo-comment">Coba komentar</label><input id="demo-comment" value={keyword} maxLength={80} onChange={e => { setKeyword(e.target.value); setSent(false) }} /></div><span>♡</span></div>
    <button className={styles.runRule} onClick={() => setSent(true)}>Uji Auto DM <ArrowUpRight size={16} /></button>
    <div className={styles.dmResult} aria-live="polite">{sent ? matches ? <><span><Check size={15} /> Kata pemicu cocok</span><div className={styles.dmBubble}>Hai Nadia! Makasih sudah mampir. Ini info produk yang kamu minta. Mau kami bantu pilihkan?<small>Pesan simulasi · tidak terkirim ke Instagram <Check size={13} /></small></div></> : <p>Kata pemicu belum cocok. Coba ketik “INFO”. Tidak ada pesan yang dikirim.</p> : <p>Komentar yang cocok akan melanjutkan percakapan ke DM. Coba tombol di atas.</p>}</div>
  </div>
}

function Chapter({ index, motionEnabled }: { index: number; motionEnabled: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, .5, 1], [65, 0, -45])
  const rotate = useTransform(scrollYProgress, [0, .5, 1], [2, 0, -1])
  const chapter = chapters[index]
  return <section ref={ref} id={chapter.id} data-chapter={index} className={`${styles.chapter} ${index % 2 ? styles.alternate : ''}`} aria-labelledby={`${chapter.id}-title`}>
    <div className={styles.chapterCopy}><span className={styles.chapterLabel}><b>0{index + 1}</b>{chapter.label}</span><h2 id={`${chapter.id}-title`}>{chapter.title}</h2><p>{chapter.description}</p><span className={styles.tryHint}>↗ {chapter.detail}</span><Link href="/daftar">Mulai dengan Carousely <ArrowUpRight size={17} /></Link></div>
    <motion.div className={styles.simulation} style={motionEnabled ? { y, rotate } : undefined}><div className={styles.progressTrack} aria-hidden="true"><motion.div style={{ scaleX: motionEnabled ? scrollYProgress : 1 }} /></div>{index === 0 ? <CalendarSimulation /> : index === 1 ? <ChatSimulation progress={scrollYProgress} motionEnabled={motionEnabled} /> : index === 2 ? <DesignSimulation /> : <DmSimulation />}</motion.div>
  </section>
}

export function ProductJourney({ motionEnabled }: { motionEnabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-chapter]'))
    let frame = 0
    const update = () => {
      frame = 0
      const line = innerHeight * .55
      setActive(sections.findIndex(section => {
        const box = section.getBoundingClientRect()
        return box.top <= line && box.bottom > line
      }))
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); cancelAnimationFrame(frame) }
  }, [])
  return <div ref={ref} id="fitur" className={styles.journey}>
    <div className={styles.journeyIntro}><span className={styles.eyebrow}>BUKAN SEKADAR BIKIN KONTEN</span><h2>Satu partner.<br />Dari rencana sampai percakapan.</h2><p>Kenalan dengan alur kerja yang saling terhubung.<br />Semua demo di bawah bisa kamu coba, tanpa akun.</p></div>
    <div className={styles.tourArea}>
      <div className={styles.guideRail} data-side={active % 2 === 1 ? "right" : "left"} data-motion={motionEnabled}><motion.aside aria-label="Panduan Mimo" className={styles.guide} data-active={active} initial={false} animate={{ opacity: active < 0 ? 0 : 1, scale: active < 0 ? .3 : 1, y: motionEnabled && active % 2 === 1 ? 10 : 0 }} transition={motionEnabled ? { type: 'spring', stiffness: 240, damping: 15 } : { duration: 0 }}><MimoMascot size={86} still={!motionEnabled} mood="smile" pulse={active + 1} /><div className={styles.speech}><b>Mimo, partner kreatifmu</b><p>{chapters[Math.max(0, active)].note}</p></div></motion.aside></div>
      {chapters.map((chapter, index) => <Chapter key={chapter.id} index={index} motionEnabled={motionEnabled} />)}
    </div>
    <p className={styles.disclaimer}>Simulasi interaktif dengan data ilustrasi. Tidak melakukan riset, publikasi, atau pengiriman DM sungguhan.</p>
  </div>
}
