import { createTranslator } from 'use-intl/core'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/onboarding.json'
import enMessages from '../../messages/en/onboarding.json'
/** The onboarding wizard's answers and their validation, shared by /mulai and the server. */
import { BRAND_TEXT_LIMITS, isObject, lengthOf, readColors, type BrandColor } from './brand-options'
import { isAccountKind, isDesignStyle, type AccountKind, type DesignStyleId } from './design-styles'

export interface OnboardingAnswers {
  accountKind: AccountKind | ''
  name: string
  category: string
  description: string
  audience: string
  designStyle: DesignStyleId | ''
  headingFont: string
  bodyFont: string
  colors: BrandColor[]
  /** One of POSTS_PER_WEEK_CHOICES; 0 while unanswered. Becomes the content strategy's rhythm. */
  postsPerWeek: number
  /** Where the user heard of Carousely: a REFERRAL_SOURCES label or their own words; '' while unanswered. */
  referralSource: string
  /**
   * The Instagram username the user confirmed in "Ini akun kamu?". Only the server sets it (confirmInstagram), from
   * its own lookup; '' until then and for a user without Instagram.
   */
  igUsername: string
  noInstagram: boolean
  goal: Goal | ''
  website: string
  captionLanguage: CaptionLanguage | ''
  postsLastMonth: PostsLastMonth | ''
  handler: Handler | ''
  skillLevel: SkillLevel | ''
  logoChoice: LogoChoice | ''
}

/** The one-tap questions. The ids are what Admin › Onboarding counts; the labels are in onboarding.json. */
export const GOALS = ['sales', 'awareness', 'education', 'time'] as const
export const CAPTION_LANGUAGES = ['id', 'en', 'mixed'] as const
export const POSTS_LAST_MONTH = ['none', 'few', 'some', 'many'] as const
export const HANDLERS = ['self', 'team', 'agency', 'nobody'] as const
export const SKILL_LEVELS = ['pro', 'decent', 'learning', 'new'] as const
/** Whose picture becomes the brand logo: the Instagram profile picture, an upload, or none for now. */
export const LOGO_CHOICES = ['instagram', 'upload', 'none'] as const
export type Goal = (typeof GOALS)[number]
export type CaptionLanguage = (typeof CAPTION_LANGUAGES)[number]
export type PostsLastMonth = (typeof POSTS_LAST_MONTH)[number]
export type Handler = (typeof HANDLERS)[number]
export type SkillLevel = (typeof SKILL_LEVELS)[number]
export type LogoChoice = (typeof LOGO_CHOICES)[number]

/** The choice questions and their answers, in the order the wizard asks them. */
export const CHOICE_QUESTIONS = {
  goal: GOALS,
  captionLanguage: CAPTION_LANGUAGES,
  postsLastMonth: POSTS_LAST_MONTH,
  handler: HANDLERS,
  skillLevel: SKILL_LEVELS,
  logoChoice: LOGO_CHOICES,
} as const
export type ChoiceQuestion = keyof typeof CHOICE_QUESTIONS

/** The wizard's steps, in order; `last_step` in the database is one of them. */
export const ONBOARDING_STEPS = [
  'instagram', 'confirm', 'brand', 'goal', 'website', 'language', 'posts', 'frequency', 'handler', 'skill', 'referral', 'logo', 'done',
] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]
export const isOnboardingStep = (value: unknown): value is OnboardingStep =>
  typeof value === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(value)

export const WEBSITE_MAX_LENGTH = 300

/** A website as the user typed it, with https:// when the scheme is missing; null when it is not a web address. */
export function parseWebsite(input: string): string | null {
  const text = input.trim()
  if (!text) return ''
  if (text.length > WEBSITE_MAX_LENGTH || /\s/.test(text)) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return url.hostname.includes('.') ? url.toString().slice(0, WEBSITE_MAX_LENGTH) : null
  } catch {
    return null
  }
}

export const EMPTY_ANSWERS: OnboardingAnswers = {
  accountKind: '',
  name: '',
  category: '',
  description: '',
  audience: '',
  designStyle: '',
  headingFont: '',
  bodyFont: '',
  colors: [],
  postsPerWeek: 0,
  referralSource: '',
  igUsername: '',
  noInstagram: false,
  goal: '',
  website: '',
  captionLanguage: '',
  postsLastMonth: '',
  handler: '',
  skillLevel: '',
  logoChoice: '',
}

export const POSTS_PER_WEEK_CHOICES = [3, 5, 7, 14] as const
export const isPostsPerWeekChoice = (value: unknown): value is number =>
  typeof value === 'number' && (POSTS_PER_WEEK_CHOICES as readonly number[]).includes(value)

/** The ready answers to "Tahu Carousely dari mana?"; "Lainnya" lets the user type their own. */
export const REFERRAL_SOURCES = ['Instagram', 'TikTok', 'YouTube', 'Google', 'Teman atau rekan', 'Komunitas atau grup'] as const
export const REFERRAL_OTHER = 'Lainnya'
export const REFERRAL_MAX_LENGTH = 100

const TEXT_FIELDS = ['name', 'category', 'description', 'audience', 'headingFont', 'bodyFont'] as const

/**
 * Validates what the wizard sent. Every answer may be empty: the answers are saved step by step, and the wizard
 * itself makes the user answer the required steps before finishing.
 */
export function parseAnswers(input: unknown, locale: Locale = 'id'): { answers: OnboardingAnswers } | { error: string } {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages })
  if (!isObject(input)) return { error: t('errors.invalid') }
  const answers: OnboardingAnswers = { ...EMPTY_ANSWERS }
  for (const field of TEXT_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    if (typeof value !== 'string') return { error: t('errors.invalid') }
    const text = value.replace(/\r\n/g, '\n').trim()
    const limit = BRAND_TEXT_LIMITS[field]
    if (lengthOf(text) > limit) return { error: t('errors.length', { field: t(`fields.${field}`), count: limit }) }
    answers[field] = text
  }
  const { accountKind, designStyle } = input
  if (accountKind !== undefined && accountKind !== '') {
    if (!isAccountKind(accountKind)) return { error: t('errors.kind') }
    answers.accountKind = accountKind
  }
  if (designStyle !== undefined && designStyle !== '') {
    if (!isDesignStyle(designStyle)) return { error: t('errors.style') }
    answers.designStyle = designStyle
  }
  const colors = readColors(input.colors)
  if (!colors) return { error: t('errors.colors') }
  answers.colors = colors
  const { postsPerWeek, referralSource } = input
  if (postsPerWeek !== undefined && postsPerWeek !== 0) {
    if (!isPostsPerWeekChoice(postsPerWeek)) return { error: t('errors.posts') }
    answers.postsPerWeek = postsPerWeek
  }
  if (referralSource !== undefined) {
    if (typeof referralSource !== 'string') return { error: t('errors.invalid') }
    const text = referralSource.replace(/\s+/g, ' ').trim()
    if (lengthOf(text) > REFERRAL_MAX_LENGTH) return { error: t('errors.referral', { count: REFERRAL_MAX_LENGTH }) }
    answers.referralSource = text
  }
  for (const question of Object.keys(CHOICE_QUESTIONS) as ChoiceQuestion[]) {
    const value = input[question]
    if (value === undefined || value === '') continue
    if (!(CHOICE_QUESTIONS[question] as readonly unknown[]).includes(value)) return { error: t('errors.invalid') }
    ;(answers as unknown as Record<string, unknown>)[question] = value
  }
  if (input.website !== undefined) {
    const website = typeof input.website === 'string' ? parseWebsite(input.website) : null
    if (website === null) return { error: t('errors.website') }
    answers.website = website
  }
  answers.noInstagram = input.noInstagram === true
  return { answers }
}
