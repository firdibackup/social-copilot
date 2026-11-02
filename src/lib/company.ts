/** Who runs Carousely and how to reach them: the site footer, the legal pages and support links. */
export const COMPANY = {
  name: 'Carousely',
  email: 'support@carousely.ai.id',
  phone: '+62 895 09046152',
  phoneHref: 'tel:+6289509046152',
  address: [
    'Equity Tower 17th Floor',
    'Jalan Jendral Sudirman Kav. 52-53 (SCBD), RT.5/RW.3',
    'Senayan, Jakarta Selatan, Kota Jakarta Selatan',
    'Daerah Khusus Ibukota Jakarta 12190',
  ],
  /** Fixed rather than read from the clock, which Cache Components refuse during a prerender. */
  copyrightYear: 2026,
} as const

/** A mailto: link to support, with the subject filled in when given. */
export const supportMailto = (subject?: string) =>
  `mailto:${COMPANY.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
