/** How much explanatory text goes on inner slides (or a single image), not the cover or CTA. */

export const TEXT_DENSITIES = {
  padat: {
    label: 'Padat',
    description: 'Judul dan poin kunci saja. Paling cepat dibaca.',
  },
  ringkas: {
    label: 'Ringkas',
    description: 'Judul, satu kalimat penjelasan, dan beberapa poin singkat.',
  },
  seimbang: {
    label: 'Seimbang',
    description: 'Judul, 1–2 kalimat penjelasan, dan beberapa poin atau contoh.',
  },
  lengkap: {
    label: 'Lengkap',
    description: 'Tidak dipadatkan: penjelasan utuh, contoh, dan tips.',
  },
} as const

export type TextDensity = keyof typeof TEXT_DENSITIES

/** What an account that never picked one gets: enough to understand a slide without filling it. */
export const DEFAULT_DENSITY: TextDensity = 'seimbang'

export const DENSITY_ORDER = Object.keys(TEXT_DENSITIES) as TextDensity[]

export const isTextDensity = (value: unknown): value is TextDensity =>
  typeof value === 'string' && Object.hasOwn(TEXT_DENSITIES, value)

/** A stored or sent value as a density; anything else is the default. */
export const toTextDensity = (value: unknown): TextDensity => (isTextDensity(value) ? value : DEFAULT_DENSITY)
