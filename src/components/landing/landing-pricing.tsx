'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowUpRight, Check } from 'lucide-react'
import { quotePurchase, type BillingCatalog } from '@/lib/billing-catalog-options'
import { formatRupiah } from '@/lib/billing-options'
import styles from './pricing.module.css'

export function LandingPricing({ catalog, provisional = false }: { catalog: BillingCatalog; provisional?: boolean }) {
  const [selected, setSelected] = useState(1)
  const months = catalog.durations.some((item) => item.months === selected) ? selected : catalog.durations[0].months
  const pro = catalog.plans.find((plan) => plan.id === 'pro')
  const plans = catalog.plans.filter((plan) => plan.active)
  return <section id="harga" className={styles.section} aria-labelledby="pricing-title">
    <div className={styles.inner}>
      <header className={styles.heading}>
        <h2 id="pricing-title">Pilih paketnya.<br />Mulai ceritamu.</h2>
        <p>Dari konten pertama sampai kalender penuh.<br />Pilih kuota yang pas untuk ritme brand kamu.</p>
      </header>
      <div className={styles.durations} role="group" aria-label="Durasi paket">
        {catalog.durations.map((duration) => <button type="button" key={duration.months} aria-pressed={duration.months === months} onClick={() => setSelected(duration.months)}>
          {duration.months} bulan{duration.discount > 0 && <span>Hemat {duration.discount}%</span>}
        </button>)}
      </div>
      {plans.length === 0 && <p className={styles.note}>Paket sedang diperbarui. Silakan kembali sebentar lagi.</p>}
      <div className={styles.grid}>
        {plans.map((plan) => {
          const quote = quotePurchase(catalog, 0, plan.id, months)
          const multiplier = pro && plan.id !== pro.id && plan.credits > pro.credits ? plan.credits / pro.credits : null
          const estimatedPosts = Math.floor(plan.credits * 30 / 2500)
          const features = [
            `${plan.credits.toLocaleString('id-ID')} kredit AI setiap bulan`,
            'Sigap AI Chatbot',
            'Deep riset Instagram + Threads (segera untuk Threads)',
            'Ide, skrip, carousel, gambar, dan caption AI',
            'Kalender dan penjadwalan konten',
            '1 akun Instagram + 1 akun Threads',
            'Analitik dan Auto DM Instagram',
            ...(plan.prioritySupport ? ['Support prioritas 1-on-1'] : []),
            ...(plan.earlyAccess ? ['Early access fitur baru'] : []),
          ]
          return <article key={plan.id} className={`${styles.plan} ${plan.id === 'max' ? styles.max : ''}`}>
            <div className={styles.planTitle}><h3>{plan.name}</h3>{multiplier && Number.isInteger(multiplier) ? <span>{multiplier}× lebih banyak kuota AI</span> : null}</div>
            <p className={styles.description}>{plan.description}</p>
            {estimatedPosts > 0 && <p className={styles.estimate}><strong>Estimasi {estimatedPosts.toLocaleString('id-ID')}+ post per bulan</strong><span>Siap kamu review tiap minggu.</span></p>}
            <div className={styles.price} aria-live="polite"><strong>{formatRupiah(Math.round(quote.total / months))}</strong><span>/bulan</span></div>
            <p className={styles.total}>{months === 1 ? 'Dibayar bulanan' : `Total ${formatRupiah(quote.total)} untuk ${months} bulan`}<br />{months === 1 ? 'Tanpa perpanjangan otomatis.' : 'Dibayar sekaligus, bukan cicilan.'}</p>
            <Link href={`/pengaturan?billing=pilih&paket=${encodeURIComponent(plan.id)}&bulan=${months}`} className={styles.choose}>Pilih {plan.name}<ArrowUpRight size={18} aria-hidden="true" /></Link>
            <ul>{features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
          </article>
        })}
      </div>
      <p className={styles.note}>Pembayaran melalui Mayar · Kuota AI diperbarui bulanan · Riset direset pukul 00.00 WIB</p>
      <p className={styles.estimateNote}>Estimasi jumlah post bergantung pada format konten, jumlah slide, dan penggunaan AI lainnya.</p>
      {provisional && <p className={styles.note}>Harga awal ditampilkan. Ketersediaan dan harga terbaru dikonfirmasi sebelum pembayaran.</p>}
    </div>
  </section>
}
