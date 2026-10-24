'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowUpRight, Check, CreditCard, RefreshCw, X } from 'lucide-react'
import { addBillingMonths, estimatedPosts, quotePurchase, type BillingCatalog, type CatalogPlan } from '@/lib/billing-catalog-options'
import { canUpgrade, type UpgradeSnapshot } from '@/lib/billing-upgrade-options'
import { formatRupiah } from '@/lib/billing-options'
import type { Payment, Usage } from '@/lib/billing'
import { Notice } from '@/components/notice'
import { CheckoutContactFields, useCheckoutContact } from '@/components/checkout-contact-fields'
import { InstagramAiIcon } from '@/components/instagram-ai-icon'
import { checkPaymentAction, checkoutAction, upgradeQuoteAction } from './billing-actions'

type HistoryPayment = Omit<Payment, 'createdAt' | 'periodStart' | 'periodEnd'> & { createdAt: string; periodStart: string | null; periodEnd: string | null }
interface Props {
  catalog: BillingCatalog; version: number; enabled: boolean; usage: Usage | null
  period: { plan: CatalogPlan | null; start: string; end: string; activeUntil: string } | null
  payments: HistoryPayment[]; initialIntent?: string; selectedPlan?: string; initialMonths: number
  returned: boolean; orderId?: string; onboarded: boolean; syncError: boolean
  /** Prefill for the billing name and WhatsApp number. */
  contact: { name: string; whatsapp: string }
}
type Intent = 'subscribe' | 'renew' | 'upgrade' | 'status'
const BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink hover:bg-bg disabled:cursor-wait disabled:opacity-50'
const PRIMARY = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50'
const number = (value: number) => value.toLocaleString('id-ID')
const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
const date = (value: string) => dateFormat.format(new Date(value))
const LABELS = { paid: 'Lunas', pending: 'Menunggu pembayaran', expired: 'Kedaluwarsa' }

export function BillingPanel(props: Props) {
  const { catalog, period, usage, payments, enabled } = props
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [intent, setIntent] = useState<Intent>(props.returned ? 'status' : props.initialIntent === 'upgrade' && period ? 'upgrade' : period ? 'renew' : 'subscribe')
  const [planId, setPlanId] = useState(props.selectedPlan ?? period?.plan?.id ?? catalog.plans.find((plan) => plan.active)?.id ?? '')
  const [months, setMonths] = useState(catalog.durations.find((duration) => duration.months === props.initialMonths)?.months ?? catalog.durations[0].months)
  const [upgrade, setUpgrade] = useState<{ quote: UpgradeSnapshot; token: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const contact = useCheckoutContact(props.contact, 'billing')
  const upgradePlans = period?.plan ? catalog.plans.filter((plan) => canUpgrade(period.plan!, plan)) : []
  const plans = intent === 'upgrade' ? upgradePlans : catalog.plans.filter((plan) => plan.active)
  const selected = plans.find((plan) => plan.id === planId) ?? plans[0]
  const purchase = selected && intent !== 'upgrade' ? quotePurchase(catalog, props.version, selected.id, months) : null
  const waiting = payments.find((payment) => payment.status === 'pending')
  const returnedPayment = props.orderId ? payments.find((payment) => payment.id === props.orderId) : null
  const successful = returnedPayment?.status === 'paid' && !returnedPayment.fulfillmentError
  const failedFulfillment = payments.find((payment) => payment.fulfillmentError)
  const start = period ? new Date(period.activeUntil) : null
  const heading = intent === 'upgrade' ? 'Upgrade Paket' : intent === 'renew' ? 'Perpanjang Langganan' : intent === 'status' ? 'Status Pembayaran' : 'Pilih Paket'

  useEffect(() => {
    if (props.initialIntent || props.selectedPlan || props.returned) dialog.current?.showModal()
  }, [props.initialIntent, props.selectedPlan, props.returned])

  function open(next: Intent) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setIntent(next); setUpgrade(null); setError(null)
    setPlanId(next === 'upgrade' ? upgradePlans[0]?.id ?? '' : period?.plan?.id ?? catalog.plans[0]?.id ?? '')
    dialog.current?.showModal()
  }
  function close() {
    dialog.current?.close()
    const url = new URL(window.location.href)
    for (const key of ['billing', 'paket', 'bulan', 'bayar', 'pesanan', 'gagal']) url.searchParams.delete(key)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    ;(opener.current ?? trigger.current)?.focus()
  }
  function check() {
    setError(null)
    startTransition(async () => {
      try { const result = await checkPaymentAction(); setError(result.error) }
      catch { setError('Status belum bisa diperiksa. Coba lagi.') }
    })
  }
  function pay() {
    if (!selected) return
    setError(null)
    const quoting = intent === 'upgrade' && !upgrade
    const details = quoting ? null : contact.validate()
    if (!quoting && !details) return
    startTransition(async () => {
      try {
        if (quoting) {
          const result = await upgradeQuoteAction(selected.id)
          if (result.error) setError(result.error)
          else if (result.data) setUpgrade(result.data)
          return
        }
        const result = await checkoutAction({ planId: selected.id, months, version: props.version, upgradeToken: upgrade?.token, contact: details! })
        if ('field' in result && result.field === 'contact') contact.showServerError(result.error)
        else if (result.error) setError(result.error)
        else if (result.link) window.location.assign(result.link)
      } catch { setError('Pembayaran belum bisa disiapkan. Coba lagi.') }
    })
  }

  return <section id="paket" aria-labelledby="paket-heading" className="scroll-mt-6 space-y-4">
    <h2 id="paket-heading" className="text-lg font-semibold text-ink">Paket & Kredit</h2>
    {props.syncError && <Notice tone="warning">Status pembayaran terbaru belum bisa diperiksa. Gunakan Cek Status untuk mencoba lagi.</Notice>}
    {failedFulfillment && <Notice tone="warning">Pembayaran upgrade diterima, tetapi paket berubah sebelum aktivasi. Hubungi tim dengan nomor pesanan {failedFulfillment.id} untuk penyelesaian.</Notice>}
    <div className="overflow-hidden rounded-xl border border-hairline bg-paper">
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-xl font-semibold text-ink">{period ? period.plan?.name ?? 'Langganan' : 'Mulai dengan paket pilihanmu'}</h3>
            <p className="mt-1 text-sm text-ink-muted">{period ? `Aktif sampai ${date(period.activeUntil)}` : 'Aktifkan paket untuk membuat dan menjadwalkan konten.'}</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${period ? 'bg-mint text-mint-ink' : 'bg-zinc-100 text-zinc-600'}`}>{period ? 'Aktif' : 'Belum aktif'}</span>
        </div>
        {usage && period && <div className="space-y-2">
          <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-ink-muted">Sisa kredit periode ini</span><strong className="tabular-nums text-ink">{number(Math.max(0, usage.credits - usage.used))} kredit</strong></div>
          <div role="progressbar" aria-label="Kredit terpakai" aria-valuemin={0} aria-valuemax={usage.credits} aria-valuenow={Math.min(usage.credits, Math.max(0, usage.used))} className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-primary" style={{ width: `${usage.percent}%` }} />
          </div>
          <p className="text-sm tabular-nums text-ink-muted">{number(Math.max(0, usage.used))} dari {number(usage.credits)} kredit digunakan.</p>
          <p className="text-xs text-ink-muted">{period.end < period.activeUntil ? `Kuota diperbarui ${date(period.end)}.` : `Kuota berlaku sampai ${date(period.end)}.`} Sisa kuota tidak terbawa ke periode berikutnya.</p>
        </div>}
        <div className="flex flex-wrap gap-2">
          {period ? <button ref={trigger} onClick={() => open('renew')} className={PRIMARY}><CreditCard size={16} aria-hidden="true" />Perpanjang</button>
            : <Link href="/langganan" className={PRIMARY}><CreditCard size={16} aria-hidden="true" />{payments.some((payment) => payment.status === 'paid') ? 'Aktifkan Kembali' : 'Pilih Paket'}</Link>}
          {!!upgradePlans.length && <button onClick={() => open('upgrade')} className={BUTTON}>Upgrade Paket<ArrowUpRight size={16} aria-hidden="true" /></button>}
          {waiting && <button onClick={() => open('status')} className={BUTTON}>Pembayaran Tertunda</button>}
        </div>
        {!enabled && <p className="text-sm text-ink-muted">Pembayaran belum diaktifkan. Akses yang sudah diberikan tetap berlaku.</p>}
        {period?.plan?.prioritySupport && catalog.supportUrl && <a href={catalog.supportUrl} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-primary underline underline-offset-4">Support prioritas · {catalog.supportHours || 'Hubungi tim'}</a>}
      </div>
      <details className="border-t border-hairline px-5 py-4 sm:px-6"><summary className="cursor-pointer text-sm font-medium text-ink">Detail kredit & tarif fitur</summary>
        <div className="mt-4 space-y-4 text-sm text-ink-muted">
          {period && usage && <p>Periode {date(period.start)}–{date(period.end)} · kuota {number(usage.credits)} kredit.</p>}
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
            {[['Ide konten', catalog.rates.content_ideas], ['Skrip konten', catalog.rates.content_script], ['Konten baru (di luar gambar)', catalog.rates.content], ['Gambar AI per gambar', catalog.rates.image], ['Edit gambar', catalog.rates.slide_edit], ['Edit caption', catalog.rates.caption_edit], ['Draf balasan', catalog.rates.reply_draft]].map(([label, cost]) => <div key={label} className="contents"><dt>{label}</dt><dd className="tabular-nums text-ink">{cost} kredit</dd></div>)}
          </dl>
        </div>
      </details>
      <details className="border-t border-hairline px-5 py-4 sm:px-6"><summary className="cursor-pointer text-sm font-medium text-ink">Riwayat pembayaran</summary>
        {!payments.length ? <p className="mt-4 text-sm text-ink-muted">Belum ada pembayaran.</p> : <ul className="mt-2 divide-y divide-hairline">{payments.map((payment) => <li key={payment.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
          <div><p className="font-medium text-ink">{payment.kind === 'upgrade' ? 'Upgrade' : 'Paket'} {payment.planName ?? 'Carousely'}</p><p className="mt-1 text-xs text-ink-muted">{date(payment.createdAt)} · {LABELS[payment.status]}</p>
            {payment.periodStart && payment.periodEnd && <p className="mt-1 text-xs text-ink-muted">{date(payment.periodStart)}–{date(payment.periodEnd)}</p>}</div>
          <span className="tabular-nums text-ink">{payment.amount ? formatRupiah(payment.amount) : 'Gratis'}</span>
        </li>)}</ul>}
      </details>
    </div>

    <dialog ref={dialog} aria-labelledby="billing-title" aria-describedby="billing-description" onCancel={(event) => { event.preventDefault(); close() }}
      className="m-auto h-dvh max-h-dvh w-full max-w-none overflow-y-auto bg-paper p-0 text-ink shadow-xl backdrop:bg-zinc-950/45 sm:h-auto sm:max-h-[90dvh] sm:w-[min(40rem,calc(100%-3rem))] sm:rounded-2xl sm:border sm:border-hairline">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-hairline bg-paper p-5 sm:p-6">
        <div><h2 id="billing-title" className="text-xl font-semibold">{heading}</h2><p id="billing-description" className="mt-1 text-sm text-ink-muted">{intent === 'upgrade' ? 'Naik paket sekarang, masa aktif tetap.' : intent === 'status' ? 'Aktivasi dilakukan setelah pembayaran terverifikasi.' : 'Prabayar, tanpa perpanjangan otomatis.'}</p></div>
        <button type="button" autoFocus aria-label="Tutup pop-up" onClick={close} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-bg"><X size={20} /></button>
      </header>
      <div className="space-y-5 p-5 sm:p-6">
        {error && <Notice tone="error">{error}</Notice>}
        {intent === 'status' ? <div className="space-y-4" aria-live="polite">
          {successful ? <><div className="flex items-center gap-3 text-mint-ink"><Check size={24} /><h3 className="text-lg font-semibold">{returnedPayment.kind === 'upgrade' ? 'Paket berhasil di-upgrade' : 'Pembayaran diterima'}</h3></div><p className="text-sm text-ink-muted">Paket dan detail kredit sudah diperbarui di Pengaturan.</p>
            {!props.onboarded && <Link href="/mulai" className={PRIMARY}>Lanjutkan Pengaturan Brand</Link>}</>
            : returnedPayment?.fulfillmentError ? <Notice tone="warning">Pembayaran diterima, tetapi aktivasi perlu bantuan tim. Nomor pesanan: {returnedPayment.id}.</Notice>
              : returnedPayment?.status === 'expired' ? <Notice tone="warning">Tautan pembayaran kedaluwarsa. Jika sudah membayar, cek status sekali lagi.</Notice>
                : <p className="text-sm text-ink-muted">{waiting ? 'Pembayaran masih menunggu konfirmasi. Jika sudah membayar, cek status untuk memperbarui paket.' : 'Belum ada pembayaran baru yang terkonfirmasi. Cek status jika kamu baru selesai membayar.'}</p>}
          {waiting?.link && <a href={waiting.link} className={PRIMARY}>Lanjutkan Pembayaran<ArrowUpRight size={16} /></a>}
          <button onClick={check} disabled={pending} className={BUTTON}><RefreshCw size={16} className={pending ? 'animate-spin' : ''} />{pending ? 'Memeriksa…' : 'Cek Status'}</button>
        </div> : <>
          {waiting && <Notice tone="warning">Ada pembayaran tertunda. <button onClick={() => setIntent('status')} className="font-medium underline">Lihat pembayaran</button> sebelum membuat pesanan baru.</Notice>}
          <fieldset disabled={pending} className="space-y-3"><legend className="mb-2 text-sm font-medium">{intent === 'upgrade' ? `Dari ${period?.plan?.name ?? 'paket aktif'} ke` : 'Pilih paket'}</legend>
            <div className={`grid gap-3 ${plans.length > 1 ? 'sm:grid-cols-2' : ''}`}>{plans.map((plan) => <label key={plan.id} className={`cursor-pointer rounded-xl border p-4 ${selected?.id === plan.id ? 'border-primary bg-primary/5' : 'border-hairline hover:bg-bg'}`}>
              <span className="flex items-center justify-between gap-3"><strong>{plan.name}</strong><input type="radio" name="billing-plan" value={plan.id} checked={selected?.id === plan.id} onChange={() => { setPlanId(plan.id); setUpgrade(null); setError(null) }} /></span>
              <span className="mt-2 block text-sm text-ink-muted">{plan.description}</span><span className="mt-3 block text-sm font-medium">±{number(estimatedPosts(plan.credits))} post / bulan</span>
              <span className="mt-1 block text-sm text-ink-muted">{formatRupiah(plan.priceIdr)} / bulan</span>
            </label>)}</div>
          </fieldset>
          {!plans.length && <Notice tone="warning">Belum ada paket yang tersedia untuk pilihan ini.</Notice>}
          {selected && <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted"><span className="inline-flex items-center gap-1.5 font-medium text-ink"><InstagramAiIcon width={18} height={18} />Riset Instagram/Threads</span><span className="rounded-full bg-[linear-gradient(90deg,#FA7E1E,#D62976,#962FBF)] px-2 py-0.5 text-[11px] font-semibold text-white">Fitur unggulan</span>{selected.prioritySupport && <span>· Support prioritas</span>}{selected.earlyAccess && <span>· Early access</span>}</p>}
          {intent !== 'upgrade' && <fieldset disabled={pending}><legend className="mb-3 text-sm font-medium">Durasi langganan</legend><div className="flex flex-wrap gap-2">{catalog.durations.map((duration) => <button type="button" key={duration.months} aria-pressed={months === duration.months} onClick={() => setMonths(duration.months)} className={`${BUTTON} ${months === duration.months ? 'border-primary bg-primary/5 text-primary' : ''}`}>
            {duration.months} bulan{duration.discount > 0 ? ` · −${duration.discount}%` : ''}</button>)}</div></fieldset>}
          <div className="space-y-3 border-t border-hairline pt-5 text-sm">
            {intent === 'upgrade' ? <>
              <p>Kredit yang sudah dipakai tetap tercatat. Kuota naik ke paket baru setelah pembayaran terverifikasi.</p>
              <p className="text-ink-muted">Biaya dihitung dari selisih harga untuk sisa periode berjalan dan masa aktif mendatang, mengikuti diskon pembelian semula.</p>
              {upgrade && <><dl className="space-y-3"><div className="flex justify-between gap-4"><dt>Tambahan kuota periode ini</dt><dd className="font-medium tabular-nums">{number(upgrade.quote.additionalCredits)} kredit</dd></div><div className="flex justify-between gap-4"><dt>Masa aktif tetap sampai</dt><dd>{date(upgrade.quote.activeUntil)}</dd></div></dl>
                <details><summary className="cursor-pointer text-ink-muted">Rincian biaya per periode pembelian</summary><ul className="mt-3 space-y-2">{upgrade.quote.terms.map((term) => <li key={term.id} className="flex flex-wrap justify-between gap-2"><span>{term.from.name} · {date(term.start)}–{date(term.end)}</span><span>{formatRupiah(term.amount)}</span></li>)}</ul></details>
                <div className="flex justify-between gap-4 border-t border-hairline pt-3 font-semibold"><span>Total upgrade</span><span>{formatRupiah(upgrade.quote.total)}</span></div>
                <p className="text-xs text-ink-muted">Ringkasan berlaku 10 menit. Tautan pembayaran berlaku maksimal 1 jam.</p>
                <button disabled={pending} onClick={() => setUpgrade(null)} className="text-primary underline underline-offset-4">Hitung ulang biaya</button></>}
            </> : purchase && <><p className="text-ink-muted">{start ? `Masa tambahan: ${date(start.toISOString())}–${date(addBillingMonths(start, months).toISOString())}.` : `Aktif selama ${months} bulan sejak pembayaran dikonfirmasi.`} Kuota AI diperbarui setiap bulan.</p>
              <dl className="space-y-2"><div className="flex justify-between"><dt>Harga {months} bulan</dt><dd>{formatRupiah(purchase.plan.priceIdr * months)}</dd></div>{purchase.discount > 0 && <div className="flex justify-between"><dt>Diskon {purchase.discount}%</dt><dd>−{formatRupiah(purchase.plan.priceIdr * months - purchase.total)}</dd></div>}<div className="flex justify-between border-t border-hairline pt-3 font-semibold"><dt>Total pembayaran</dt><dd>{formatRupiah(purchase.total)}</dd></div></dl></>}
          </div>
          {enabled && !waiting && !!selected && (intent !== 'upgrade' || !!upgrade) && <CheckoutContactFields contact={contact} disabled={pending} className="border-t border-hairline pt-5" />}
        </>}
      </div>
      {intent !== 'status' && <footer className="sticky bottom-0 border-t border-hairline bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
        {(upgrade || purchase) && <p className="mb-3 flex justify-between gap-3 text-sm font-semibold tabular-nums"><span>Total pembayaran</span><span>{formatRupiah(upgrade?.quote.total ?? purchase!.total)}</span></p>}
        <button disabled={pending || !enabled || !selected || !!waiting} onClick={pay} className={`${PRIMARY} w-full`}>
        {pending ? 'Menyiapkan…' : !enabled ? 'Pembayaran belum diaktifkan' : intent === 'upgrade' ? upgrade ? 'Bayar & Upgrade' : 'Hitung Biaya Upgrade' : 'Lanjut ke Pembayaran'}
      </button><p className="mt-2 text-center text-xs text-ink-muted">Pembayaran diproses melalui Mayar.</p></footer>}
    </dialog>
  </section>
}
