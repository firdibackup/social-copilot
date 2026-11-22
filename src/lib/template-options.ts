
import { createTranslator } from 'use-intl/core'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/editor.json'
import enMessages from '../../messages/en/editor.json'
/** Design templates: the admin's example slides, shared by Admin › Template, the AI analysis and Buat Konten. */
import { REFERENCE_LABELS, type Picker, type ReferenceLabel, type SlideRole } from './brand-options'
import { DESIGN_STYLE_IDS, isDesignStyle, styleChain, type DesignStyleId } from './design-styles'

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

/** An active, analysed template of the bank, with every style it was filed under. */
export interface BankTemplate extends PoolTemplate {
  styles: DesignStyleId[]
}

/** The template a role follows and the style it was taken from (the brand's, a fallback's, or any). */
export interface ChosenTemplate {
  id: string
  label: ReferenceLabel
  style: DesignStyleId
}

/**
 * One template per role for a new post of the given style: a cover, one inner template shared by every inner
 * slide, and a CTA. A role the style has no template for is borrowed from the nearest style (STYLE_FALLBACKS); then
 * an Umum template of the style or its fallbacks; then that role from any style. Null only for an empty bank.
 */
export function chooseRoleTemplates(bank: BankTemplate[], style: DesignStyleId, pick: Picker): Record<SlideRole, ChosenTemplate | null> {
  const chain = styleChain(style)
  const inChain = (label: ReferenceLabel): ChosenTemplate | null => {
    for (const candidate of chain) {
      const picked = pick(bank.filter((template) => template.label === label && template.styles.includes(candidate)))
      if (picked) return { id: picked.id, label, style: candidate }
    }
    return null
  }
  const anyStyle = (label: ReferenceLabel): ChosenTemplate | null => {
    const picked = pick(bank.filter((template) => template.label === label && template.styles.length > 0))
    return picked ? { id: picked.id, label, style: picked.styles[0] } : null
  }
  const general = inChain('single')
  const forRole = (label: SlideRole) => inChain(label) ?? general ?? anyStyle(label)
  return { cover: forRole('cover'), isi: forRole('isi'), cta: forRole('cta') }
}

/** Each slide's template id from chooseRoleTemplates; a one-image post takes the cover's. */
export function planTemplates(bank: BankTemplate[], style: DesignStyleId, roles: (SlideRole | null)[], pick: Picker): (string | null)[] {
  const chosen = chooseRoleTemplates(bank, style, pick)
  return roles.map((role) => chosen[role ?? 'cover']?.id ?? null)
}

export type TemplateCoverage = { style: DesignStyleId; counts: Record<ReferenceLabel, number>; missing: SlideRole[] }[]

/** How many ready, active templates each style has per label, and which carousel roles it lacks (Admin › Template). */
export function templateCoverage(templates: Pick<DesignTemplate, 'styles' | 'label' | 'status' | 'active'>[]): TemplateCoverage {
  return DESIGN_STYLE_IDS.map((style) => {
    const counts = Object.fromEntries(Object.keys(REFERENCE_LABELS).map((label) => [label, 0])) as Record<ReferenceLabel, number>
    for (const template of templates) {
      if (template.status === 'ready' && template.active && template.label && template.styles.includes(style)) counts[template.label] += 1
    }
    const missing = (['cover', 'isi', 'cta'] as const).filter((role) => counts[role] === 0)
    return { style, counts, missing }
  })
}

/** The admin's correction of one template, from the edit form. */
export function parseTemplateEdit(
  fields: Record<string, unknown>,
  styles: unknown[], locale: Locale = 'id',
): { styles: DesignStyleId[]; label: ReferenceLabel } | { error: string } {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'templateOptions' })

  const picked = DESIGN_STYLE_IDS.filter((id) => styles.includes(id))
  if (styles.some((style) => !isDesignStyle(style))) return { error: t('message1') }
  if (picked.length === 0) return { error: t('message2') }
  if (!isTemplateLabel(fields.label)) return { error: t('message3') }
  return { styles: picked, label: fields.label }
}
