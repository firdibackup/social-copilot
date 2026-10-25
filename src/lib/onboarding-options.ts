/** The onboarding wizard's answers and their validation, shared by /mulai and the server. */
import { BRAND_TEXT_LIMITS, FIELD_LABELS, isObject, lengthOf, readColors, type BrandColor } from './brand-options'
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
export function parseAnswers(input: unknown): { answers: OnboardingAnswers } | { error: string } {
  if (!isObject(input)) return { error: 'Jawaban tidak valid.' }
  const answers: OnboardingAnswers = { ...EMPTY_ANSWERS }
  for (const field of TEXT_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    if (typeof value !== 'string') return { error: 'Jawaban tidak valid.' }
    const text = value.replace(/\r\n/g, '\n').trim()
    const limit = BRAND_TEXT_LIMITS[field]
    if (lengthOf(text) > limit) return { error: `${FIELD_LABELS[field]} maksimal ${limit} karakter.` }
    answers[field] = text
  }
  const { accountKind, designStyle } = input
  if (accountKind !== undefined && accountKind !== '') {
    if (!isAccountKind(accountKind)) return { error: 'Jenis akun tidak dikenal.' }
    answers.accountKind = accountKind
  }
  if (designStyle !== undefined && designStyle !== '') {
    if (!isDesignStyle(designStyle)) return { error: 'Gaya desain tidak dikenal.' }
    answers.designStyle = designStyle
  }
  const colors = readColors(input.colors)
  if (!colors) return { error: 'Warna tidak valid.' }
  answers.colors = colors
  const { postsPerWeek, referralSource } = input
  if (postsPerWeek !== undefined && postsPerWeek !== 0) {
    if (!isPostsPerWeekChoice(postsPerWeek)) return { error: 'Pilih jumlah posting per minggu dari pilihan yang ada.' }
    answers.postsPerWeek = postsPerWeek
  }
  if (referralSource !== undefined) {
    if (typeof referralSource !== 'string') return { error: 'Jawaban tidak valid.' }
    const text = referralSource.replace(/\s+/g, ' ').trim()
    if (lengthOf(text) > REFERRAL_MAX_LENGTH) return { error: `Jawaban "tahu dari mana" maksimal ${REFERRAL_MAX_LENGTH} karakter.` }
    answers.referralSource = text
  }
  return { answers }
}
