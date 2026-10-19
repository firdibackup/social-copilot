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
}

const TEXT_FIELDS = ['name', 'category', 'description', 'audience', 'headingFont', 'bodyFont'] as const

/** Validates what the wizard sent. Every answer may be empty: each step can be skipped. */
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
  return { answers }
}
