/** Admin follow-ups on unfinished Mayar checkouts: the WhatsApp message. Pure, shared by the page and tests. */
import { formatRupiah } from './billing-options'

export interface UnfinishedPayment {
  paymentId: string
  userId: string
  email: string
  /** The name given at checkout; null for checkouts from before the form asked. */
  name: string | null
  /** International digits, e.g. "6281234567890". */
  whatsapp: string | null
  planName: string | null
  months: number | null
  /** The coupon applied at checkout, if any. */
  couponCode?: string | null
  kind: 'subscription' | 'upgrade'
  amount: number
  /** "pending" while the Mayar link can still be paid. */
  status: 'pending' | 'expired'
  createdAt: Date
  expiresAt: Date | null
  link: string | null
  remindedAt: Date | null
  reminderCount: number
  /** Unfinished checkouts of this user in the window, this one included. */
  attempts: number
}

const timeFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta', timeZoneName: 'short',
})

/** The chat an admin starts from the dashboard. `subscribeUrl` is where a new link is made once the old one expired. */
export function reminderMessage(payment: UnfinishedPayment, subscribeUrl: string): string {
  const greeting = `Halo${payment.name ? ` ${payment.name}` : ''}, kami dari tim Carousely.`
  const order = `${payment.kind === 'upgrade' ? 'upgrade ke paket' : 'paket'} ${payment.planName ?? 'Carousely'}${payment.months && payment.kind !== 'upgrade' ? ` ${payment.months} bulan` : ''} (${formatRupiah(payment.amount)})`
  if (payment.status === 'pending' && payment.link) {
    const until = payment.expiresAt ? ` Tautannya berlaku sampai ${timeFormat.format(payment.expiresAt)}.` : ''
    return `${greeting} Pembayaran ${order} kamu belum selesai. Kamu bisa melanjutkannya di sini: ${payment.link}${until}\n\nAda kendala saat membayar? Balas pesan ini, kami bantu.`
  }
  return `${greeting} Kami lihat pembayaran ${order} kamu belum selesai dan tautannya sudah kedaluwarsa.\n\nAda kendala saat membayar? Balas pesan ini, kami bantu. Kalau masih berminat, buat pesanan baru di ${subscribeUrl}`
}
