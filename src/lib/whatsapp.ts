/** WhatsApp numbers of paying customers: parsing, display and click-to-chat links. Pure, shared by client and server. */

export const CUSTOMER_NAME_MAX_LENGTH = 100
const STORED = /^[1-9]\d{9,14}$/

/**
 * The number in international digits without "+", e.g. "6281234567890", or null when it can't be one. Indonesian
 * habits are accepted: "0812…", "812…", "+62 812-…", "62812…".
 */
export function normalizeWhatsapp(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null
  let digits = trimmed.replace(/\D/g, '')
  if (!trimmed.startsWith('+')) {
    if (digits.startsWith('0')) digits = `62${digits.slice(1)}`
    else if (digits.startsWith('8')) digits = `62${digits}`
  }
  if (digits.startsWith('62') && !digits.startsWith('628')) return null
  return STORED.test(digits) ? digits : null
}

/** "+62 812-3456-7890" for people; other countries as "+<digits>". */
export function formatWhatsapp(stored: string): string {
  if (!stored.startsWith('62')) return `+${stored}`
  const local = stored.slice(2)
  return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}${local.length > 7 ? `-${local.slice(7)}` : ''}`
}

/** The local form Mayar shows on its checkout ("0812…"); foreign numbers stay international. */
export const mayarMobile = (stored: string) => (stored.startsWith('62') ? `0${stored.slice(2)}` : stored)

/** A wa.me link that opens a chat with `text` typed in. */
export const whatsappLink = (stored: string, text: string) => `https://wa.me/${stored}?text=${encodeURIComponent(text)}`

export interface CustomerContact {
  name: string
  whatsapp: string
}

/** The name and number from the checkout form, or the message to show. */
export function parseCustomerContact(input: unknown): CustomerContact | { error: string } {
  const value = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const name = typeof value.name === 'string' ? value.name.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { error: 'Isi nama untuk tagihan.' }
  if (name.length > CUSTOMER_NAME_MAX_LENGTH) return { error: `Nama maksimal ${CUSTOMER_NAME_MAX_LENGTH} karakter.` }
  const whatsapp = normalizeWhatsapp(value.whatsapp)
  if (!whatsapp) return { error: 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.' }
  return { name, whatsapp }
}
