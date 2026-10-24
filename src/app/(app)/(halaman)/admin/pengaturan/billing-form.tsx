'use client'

import { useActionState, useState } from 'react'
import { Notice } from '@/components/notice'
import type { BillingCatalog, CatalogPlan } from '@/lib/billing-catalog-options'
import { formatRupiah } from '@/lib/billing-options'
import { BUTTON, CARD, CARD_TITLE, FIELD, HINT, LABEL, PRIMARY_BUTTON } from '../ui'
import { saveCatalogAction } from './billing-actions'

const RATE_LABELS: Record<string, string> = {
  image: 'Gambar baru (per slide)', content: 'Susunan konten dan caption', content_slide: 'Slide yang sudah dibayar',
  slide_edit: 'Edit gambar', caption_edit: 'Edit caption', content_ideas: 'Ide konten', content_script: 'Skrip',
  brand_profile: 'Profil brand', brand_visual: 'Visual brand', brand_strategy: 'Strategi brand', website_catalog: 'Katalog website',
  asset_tags: 'Tag aset (per foto)', reply_draft: 'Draf balasan', template_analysis: 'Analisis template admin',
  reference_labels: 'Kategori referensi dari grid',
  chat: 'Chat SIGAP (per pesan)', deep_search: 'Riset (di samping batas harian)', chat_summary: 'Ringkasan percakapan',
}

export function BillingForm({ catalog, version }: { catalog: BillingCatalog; version: number }) {
  const [config, setConfig] = useState(catalog)
  const [state, action, pending] = useActionState(saveCatalogAction, { error: null, success: null })
  const updatePlan = (index: number, patch: Partial<CatalogPlan>) => setConfig((current) => ({ ...current,
    plans: current.plans.map((plan, i) => i === index ? { ...plan, ...patch } : plan) }))
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="config" value={JSON.stringify(config)} />
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-zinc-900">Paket & kredit</h2>
        <p className={HINT}>Versi {version}. Harga dan kuota baru berlaku untuk checkout berikutnya. Tarif kredit berlaku untuk pekerjaan berikutnya.</p>
      </header>
      {config.plans.map((plan, index) => (
        <fieldset key={index} className={CARD} disabled={pending}>
          <legend className={CARD_TITLE}>{plan.name || 'Paket baru'} · {formatRupiah(plan.priceIdr)}/bulan</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={LABEL}>ID paket<input className={FIELD} value={plan.id} required pattern="[a-z][a-z0-9-]{0,39}" onChange={(e) => updatePlan(index, { id: e.target.value })} /></label>
            <label className={LABEL}>Nama<input className={FIELD} value={plan.name} required maxLength={80} onChange={(e) => updatePlan(index, { name: e.target.value })} /></label>
            <label className={`${LABEL} sm:col-span-2`}>Deskripsi<input className={FIELD} value={plan.description} maxLength={250} onChange={(e) => updatePlan(index, { description: e.target.value })} /></label>
            {([['priceIdr', 'Harga bulanan (Rp)', 1000], ['credits', 'Kredit per bulan', 1], ['chatDaily', 'Chat per hari', 0], ['researchDaily', 'Riset per hari', 0]] as const).map(([key, label, min]) => (
              <label key={key} className={LABEL}>{label}<input className={FIELD} type="number" min={min} step={1} required value={plan[key]} onChange={(e) => updatePlan(index, { [key]: Number(e.target.value) })} /></label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {([['active', 'Tersedia untuk dibeli'], ['prioritySupport', 'Support prioritas 1-on-1'], ['earlyAccess', 'Early access fitur baru']] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={plan[key]} onChange={(e) => updatePlan(index, { [key]: e.target.checked })} />{label}</label>
            ))}
          </div>
          <p className={HINT}>Untuk mengarsipkan, matikan “Tersedia untuk dibeli”. Riwayat pembelian tetap tersimpan.</p>
        </fieldset>
      ))}
      <button className={BUTTON} type="button" disabled={pending || config.plans.length >= 20} onClick={() => setConfig((current) => ({ ...current, plans: [...current.plans,
        { ...current.plans[0], id: `paket-${current.plans.length + 1}`, name: 'Paket baru', active: false }] }))}>Tambah paket</button>
      <fieldset className={CARD} disabled={pending}>
        <legend className={CARD_TITLE}>Durasi & diskon</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {config.durations.map((duration, index) => (
            <label className={LABEL} key={duration.months}>{duration.months} bulan · diskon (%)
              <input className={FIELD} type="number" min={0} max={90} step={1} value={duration.discount} onChange={(e) => setConfig((current) => ({ ...current,
                durations: current.durations.map((item, i) => i === index ? { ...item, discount: Number(e.target.value) } : item) }))} />
            </label>
          ))}
        </div>
        <p className={HINT}>Dibayar sekaligus. Kuota diperbarui setiap bulan pada tanggal siklus, tanpa akumulasi sisa kuota.</p>
      </fieldset>
      <fieldset className={CARD} disabled={pending}>
        <legend className={CARD_TITLE}>Tarif kredit setiap fitur</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(config.rates).map(([key, rate]) => (
            <label className={LABEL} key={key}>{RATE_LABELS[key] ?? key}<input className={FIELD} type="number" min={0} max={10000} step={1} required
              readOnly={key === 'content_slide' || key === 'template_analysis'} value={rate} onChange={(e) => setConfig((current) => ({ ...current, rates: { ...current.rates, [key]: Number(e.target.value) } }))} /></label>
          ))}
        </div>
        <p className={HINT}>Estimasi carousel 5 slide: {config.rates.content + 5 * config.rates.image} kredit. Revisi dan skrip dihitung terpisah.</p>
      </fieldset>
      <fieldset className={CARD} disabled={pending}>
        <legend className={CARD_TITLE}>Support prioritas</legend>
        <label className={LABEL}>Tautan WhatsApp atau penjadwalan<input type="url" placeholder="https://wa.me/62…" className={FIELD} value={config.supportUrl} onChange={(e) => setConfig((current) => ({ ...current, supportUrl: e.target.value }))} /></label>
        <label className={LABEL}>Jam layanan<input className={FIELD} placeholder="Senin–Jumat, 09.00–17.00 WIB" value={config.supportHours} onChange={(e) => setConfig((current) => ({ ...current, supportHours: e.target.value }))} /></label>
      </fieldset>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <Notice tone="success">{state.success}</Notice>}
      <button className={PRIMARY_BUTTON} type="submit" disabled={pending}>{pending ? 'Menyimpan…' : 'Simpan paket & kredit'}</button>
    </form>
  )
}
