
import { createTranslator } from 'next-intl'
import { intlLocale, type Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/admin.json'
import enMessages from '../../messages/en/admin.json'
/** Choices and validation of the admin pages, shared by the forms and the server. */
import type { Plan } from './billing-options'

export const MODEL_MAX_LENGTH = 200
export const PLAN_NAME_MAX_LENGTH = 80
export const NOTE_MAX_LENGTH = 200
export const MAX_GRANT_DAYS = 366
export const MAX_ADJUSTMENT = 1_000_000
export const MIN_PASSWORD = 8

/** 9Router model ids look like `cc/claude-haiku-4-5-20251001` or `Hermes-daily`. */
const MODEL_PATTERN = /^[\w.:@/-]+$/

/** The admins: ADMIN_EMAILS, comma-separated, compared without case. */
export function parseAdminEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** What admins can override; null keeps the default from code or .env. */
export interface SettingsInput {
  textModel: string | null
  imageModel: string | null
  plan: Plan
}

type Fields = Record<string, unknown>

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

function parseModel(value: unknown, label: string, locale: Locale = 'id'): string | null | { error: string } {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages })

  const model = text(value)
  if (!model) return null
  if (model.length > MODEL_MAX_LENGTH || !MODEL_PATTERN.test(model)) {
    return { error: t('admin_options.isInvalidUseA9routerModelId', { v0: label }) }
  }
  return model
}

/** A whole number in [min, max], or null. Accepts "99.000" as typed in id-ID. */
export function parseWhole(value: unknown, min: number, max: number): number | null {
  const raw = typeof value === 'number' ? String(value) : text(value).replace(/[.\s]/g, '')
  if (!/^-?\d+$/.test(raw)) return null
  const number = Number(raw)
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null
}

export function parseSettings(fields: Fields, locale: Locale = 'id'): { settings: SettingsInput } | { error: string } {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages })

  const textModel = parseModel(fields.textModel, t('admin_options.textModel'), locale)
  if (textModel !== null && typeof textModel === 'object') return textModel
  const imageModel = parseModel(fields.imageModel, t('admin_options.imageModel'), locale)
  if (imageModel !== null && typeof imageModel === 'object') return imageModel

  const name = text(fields.planName)
  if (!name || name.length > PLAN_NAME_MAX_LENGTH) return { error: t('admin_options.planNameMustBe1Characters', { v0: PLAN_NAME_MAX_LENGTH }) }
  const priceIdr = parseWhole(fields.planPrice, 0, 100_000_000)
  if (priceIdr === null) return { error: t('admin_options.planPriceMustBeARupiahAmount') }
  const days = parseWhole(fields.planDays, 1, MAX_GRANT_DAYS)
  if (days === null) return { error: t('admin_options.planDurationMustBe1Days', { v0: MAX_GRANT_DAYS }) }
  const credits = parseWhole(fields.planCredits, 1, MAX_ADJUSTMENT)
  if (credits === null) return { error: t('admin_options.creditsPerPeriodMustBeANumber') }

  return { settings: { textModel, imageModel, plan: { name, priceIdr, days, credits } } }
}

/** Days of free subscription to grant. */
export function parseGrantDays(value: unknown, locale: Locale = 'id'): number | { error: string } {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages })

  return parseWhole(value, 1, MAX_GRANT_DAYS) ?? { error: t('admin_options.numberOfDaysMustBe1', { v0: MAX_GRANT_DAYS }) }
}

export type AdjustmentKind = 'add' | 'remove'

/** Credits to give (positive) or take (negative), with an optional note. */
export function parseAdjustment(fields: Fields, locale: Locale = 'id'): { amount: number; note: string | null } | { error: string } {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages })

  const credits = parseWhole(fields.credits, 1, MAX_ADJUSTMENT)
  if (credits === null) return { error: t('admin_options.creditAmountMustBeANumberGreater') }
  if (fields.kind !== 'add' && fields.kind !== 'remove') return { error: t('admin_options.chooseWhetherToAddOrRemoveCredits') }
  const note = text(fields.note)
  if (note.length > NOTE_MAX_LENGTH) return { error: t('admin_options.notesCanBeUpToCharacters', { v0: NOTE_MAX_LENGTH }) }
  return { amount: fields.kind === 'add' ? credits : -credits, note: note || null }
}

export function parsePassword(value: unknown, locale: Locale = 'id'): string | { error: string } {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages })

  const password = typeof value === 'string' ? value : ''
  if (password.length < MIN_PASSWORD) return { error: t('admin_options.passwordMustBeAtLeastCharacters', { v0: MIN_PASSWORD }) }
  return password
}

/** e.g. "1.234" or "−50", for credit counts. */
export const formatCredits = (credits: number, locale: Locale = 'id') => new Intl.NumberFormat(intlLocale(locale)).format(credits)
