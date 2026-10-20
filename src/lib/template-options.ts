/** Design templates: the admin's example slides, shared by Admin › Template, the AI analysis and Buat Konten. */
import { REFERENCE_LABELS, type Picker, type ReferenceLabel, type SlideRole } from './brand-options'
import { DESIGN_STYLE_IDS, isDesignStyle, type DesignStyleId } from './design-styles'

export type TemplateStatus = 'pending' | 'ready' | 'failed'

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  pending: 'Belum dianalisis',
  ready: 'Siap',
  failed: 'Gagal dianalisis',
}

export const NOTE_MAX_LENGTH = 300

export interface DesignTemplate {
  id: string
  /** The file it came from in assets/contoh-desain, for slides planned before the import; null for an upload. */
  sourceKey: string | null
  styles: DesignStyleId[]
  /** cover, isi, cta, or single (Umum); null until analysed. */
  label: ReferenceLabel | null
  /** What the AI saw, in Indonesian. */
  note: string
  status: TemplateStatus
  error: string | null
  active: boolean
  createdAt: Date
  /** A signed Storage URL for the admin's grid; never logged. */
  url: string
}

/** A template a new post can follow. */
export interface PoolTemplate {
  id: string
  label: ReferenceLabel
}

export const isTemplateLabel = (value: unknown): value is ReferenceLabel =>
  typeof value === 'string' && Object.hasOwn(REFERENCE_LABELS, value)

/** The design styles among `value`, without repeats, in the styles' own order. */
export function cleanStyles(value: unknown): DesignStyleId[] {
  if (!Array.isArray(value)) return []
  const listed = new Set(
    value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().toLowerCase()),
  )
  return DESIGN_STYLE_IDS.filter((id) => listed.has(id))
}

/**
 * Each slide's template, one per role as planReferenceImages picks references: the cover (or a one-image post) a
 * cover, the inner slides one inner template, the CTA a CTA. A role without a template of its own label takes one
 * Umum template, the same for every such role, else none.
 */
export function planTemplates(pool: PoolTemplate[], roles: (SlideRole | null)[], pick: Picker): (string | null)[] {
  const withLabel = (label: ReferenceLabel) => pool.filter((template) => template.label === label)
  const general = pick(withLabel('single'))
  const chosen: Record<SlideRole, PoolTemplate | undefined> = {
    cover: pick(withLabel('cover')) ?? general,
    isi: pick(withLabel('isi')) ?? general,
    cta: pick(withLabel('cta')) ?? general,
  }
  return roles.map((role) => chosen[role ?? 'cover']?.id ?? null)
}

/** The admin's correction of one template, from the edit form. */
export function parseTemplateEdit(
  fields: Record<string, unknown>,
  styles: unknown[],
): { styles: DesignStyleId[]; label: ReferenceLabel } | { error: string } {
  const picked = DESIGN_STYLE_IDS.filter((id) => styles.includes(id))
  if (styles.some((style) => !isDesignStyle(style))) return { error: 'Gaya tidak dikenal.' }
  if (picked.length === 0) return { error: 'Pilih minimal satu gaya.' }
  if (!isTemplateLabel(fields.label)) return { error: 'Pilih label: Cover, Isi, CTA atau Umum.' }
  return { styles: picked, label: fields.label }
}
