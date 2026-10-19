import 'server-only'
import { isHex, type BrandColor, type BrandFields } from './brand-options'
import { getConnectedAccountId } from './connection'
import { isAccountKind, isDesignStyle } from './design-styles'
import { EMPTY_ANSWERS, type OnboardingAnswers } from './onboarding-options'
import { db, unwrap } from './supabase'

interface OnboardingRow {
  account_kind: string
  name: string
  category: string
  description: string
  audience: string
  design_style: string
  heading_font: string
  body_font: string
  colors: unknown
  completed_at: string | null
}

const COLUMNS = 'account_kind, name, category, description, audience, design_style, heading_font, body_font, colors, completed_at'

const colorsFrom = (value: unknown): BrandColor[] =>
  Array.isArray(value) ? value.filter((item): item is BrandColor => isHex(item?.hex) && typeof item?.role === 'string') : []

function answersOf(row: Omit<OnboardingRow, 'completed_at'>): OnboardingAnswers {
  return {
    accountKind: isAccountKind(row.account_kind) ? row.account_kind : '',
    name: row.name,
    category: row.category,
    description: row.description,
    audience: row.audience,
    designStyle: isDesignStyle(row.design_style) ? row.design_style : '',
    headingFont: row.heading_font,
    bodyFont: row.body_font,
    colors: colorsFrom(row.colors),
  }
}

async function loadRow(userId: string): Promise<OnboardingRow | null> {
  return unwrap(await db().from('onboarding').select(COLUMNS).eq('user_id', userId).maybeSingle()) as OnboardingRow | null
}

/** Whether the user finished (or skipped) the wizard. */
export async function isOnboarded(userId: string): Promise<boolean> {
  return Boolean((await loadRow(userId))?.completed_at)
}

/**
 * The wizard's answers so far. A user who set up a brand before the wizard existed starts from the connected
 * account's kit, so they only confirm and pick a style.
 */
export async function getOnboarding(userId: string): Promise<OnboardingAnswers> {
  const row = await loadRow(userId)
  if (row) return answersOf(row)
  const accountId = await getConnectedAccountId(userId)
  if (!accountId) return { ...EMPTY_ANSWERS }
  const kit = unwrap(
    await db()
      .from('brand_kit')
      .select('account_kind, name, category, description, audience, design_style, heading_font, body_font, colors')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .maybeSingle(),
  ) as Omit<OnboardingRow, 'completed_at'> | null
  return kit ? answersOf(kit) : { ...EMPTY_ANSWERS }
}

/** The brand kit fields the answers fill: only those answered, so a skipped step keeps what the kit has. */
export function kitFieldsOf(answers: OnboardingAnswers): Partial<BrandFields> {
  const fields: Partial<BrandFields> = {}
  for (const field of ['accountKind', 'name', 'category', 'description', 'audience', 'designStyle', 'headingFont', 'bodyFont'] as const) {
    if (answers[field]) fields[field] = answers[field]
  }
  if (answers.colors.length > 0) fields.colors = answers.colors
  return fields
}

const COLUMN_OF = {
  accountKind: 'account_kind',
  name: 'name',
  category: 'category',
  description: 'description',
  audience: 'audience',
  designStyle: 'design_style',
  headingFont: 'heading_font',
  bodyFont: 'body_font',
  colors: 'colors',
} as const

/** Brand kit columns for the answered fields, for an insert or an update. */
export function kitColumnsOf(answers: OnboardingAnswers): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(kitFieldsOf(answers)).map(([field, value]) => [COLUMN_OF[field as keyof typeof COLUMN_OF], value]),
  )
}

/**
 * Saves the answers; `complete` ends the wizard. A user who already has an account connected gets the answers in
 * that account's kit at once; for an account connected later, the Instagram callback seeds the kit from them.
 */
export async function saveOnboarding(userId: string, answers: OnboardingAnswers, complete: boolean): Promise<void> {
  const now = new Date().toISOString()
  unwrap(
    await db()
      .from('onboarding')
      .upsert(
        {
          user_id: userId,
          account_kind: answers.accountKind,
          name: answers.name,
          category: answers.category,
          description: answers.description,
          audience: answers.audience,
          design_style: answers.designStyle,
          heading_font: answers.headingFont,
          body_font: answers.bodyFont,
          colors: answers.colors,
          ...(complete ? { completed_at: now } : {}),
          updated_at: now,
        },
        { onConflict: 'user_id' },
      ),
  )
  if (!complete) return
  const accountId = await getConnectedAccountId(userId)
  const columns = kitColumnsOf(answers)
  if (!accountId || Object.keys(columns).length === 0) return
  unwrap(
    await db()
      .from('brand_kit')
      .upsert({ user_id: userId, account_id: accountId, ...columns, updated_at: now }, { onConflict: 'user_id,account_id' }),
  )
}

/** The finished wizard's answers, to seed a newly connected account's kit; null without a finished wizard. */
export async function getCompletedAnswers(userId: string): Promise<OnboardingAnswers | null> {
  const row = await loadRow(userId)
  return row?.completed_at ? answersOf(row) : null
}
