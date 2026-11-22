import 'server-only'
import { isHex, type BrandColor, type BrandFields } from './brand-options'
import { getConnectedAccountId } from './connection'
import { isAccountKind, isDesignStyle } from './design-styles'
import { CHOICE_QUESTIONS, EMPTY_ANSWERS, isPostsPerWeekChoice, type ChoiceQuestion, type OnboardingAnswers, type OnboardingStep } from './onboarding-options'
import { getAccountStrategy, saveStrategy } from './brand'
import { getScheduleSettings, saveSlots } from './schedule'
import { generateSlots } from './schedule-slots'
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
  posts_per_week: number
  referral_source: string
  ig_username: string
  no_instagram: boolean
  goal: string
  website: string
  caption_language: string
  posts_last_month: string
  handler: string
  skill_level: string
  logo_choice: string
  avatar_path: string | null
  completed_at: string | null
}

type KitAnswersRow = Pick<OnboardingRow, 'account_kind' | 'name' | 'category' | 'description' | 'audience' | 'design_style' | 'heading_font' | 'body_font' | 'colors'>

const COLUMNS =
  'account_kind, name, category, description, audience, design_style, heading_font, body_font, colors, posts_per_week, referral_source, ' +
  'ig_username, no_instagram, goal, website, caption_language, posts_last_month, handler, skill_level, logo_choice, avatar_path, completed_at'

const colorsFrom = (value: unknown): BrandColor[] =>
  Array.isArray(value) ? value.filter((item): item is BrandColor => isHex(item?.hex) && typeof item?.role === 'string') : []

const CHOICE_COLUMNS: Record<ChoiceQuestion, 'goal' | 'caption_language' | 'posts_last_month' | 'handler' | 'skill_level' | 'logo_choice'> = {
  goal: 'goal',
  captionLanguage: 'caption_language',
  postsLastMonth: 'posts_last_month',
  handler: 'handler',
  skillLevel: 'skill_level',
  logoChoice: 'logo_choice',
}

function answersOf(row: KitAnswersRow & Partial<OnboardingRow>): OnboardingAnswers {
  const answers: OnboardingAnswers = {
    ...EMPTY_ANSWERS,
    accountKind: isAccountKind(row.account_kind) ? row.account_kind : '',
    name: row.name,
    category: row.category,
    description: row.description,
    audience: row.audience,
    designStyle: isDesignStyle(row.design_style) ? row.design_style : '',
    headingFont: row.heading_font,
    bodyFont: row.body_font,
    colors: colorsFrom(row.colors),
    postsPerWeek: isPostsPerWeekChoice(row.posts_per_week) ? row.posts_per_week : 0,
    referralSource: row.referral_source ?? '',
    igUsername: row.ig_username ?? '',
    noInstagram: row.no_instagram === true,
    website: row.website ?? '',
  }
  for (const question of Object.keys(CHOICE_QUESTIONS) as ChoiceQuestion[]) {
    const value = row[CHOICE_COLUMNS[question]]
    if ((CHOICE_QUESTIONS[question] as readonly unknown[]).includes(value)) (answers as unknown as Record<string, unknown>)[question] = value
  }
  return answers
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
  ) as KitAnswersRow | null
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
 * Saves the answers and the step the user reached; `complete` ends the wizard. A user who already has an account
 * connected gets the answers in that account's kit at once; for an account connected later, the Instagram callback
 * seeds the kit from them. The Instagram username is not among them: confirmInstagram sets it.
 */
export async function saveOnboarding(userId: string, answers: OnboardingAnswers, complete: boolean, step?: OnboardingStep): Promise<void> {
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
          posts_per_week: answers.postsPerWeek,
          referral_source: answers.referralSource,
          no_instagram: answers.noInstagram,
          goal: answers.goal,
          website: answers.website,
          caption_language: answers.captionLanguage,
          posts_last_month: answers.postsLastMonth,
          handler: answers.handler,
          skill_level: answers.skillLevel,
          logo_choice: answers.logoChoice,
          ...(step ? { last_step: step } : {}),
          ...(complete ? { completed_at: now, last_step: 'done' } : {}),
          updated_at: now,
        },
        { onConflict: 'user_id' },
      ),
  )
  if (!complete) return
  const accountId = await getConnectedAccountId(userId)
  if (!accountId) return
  const columns = kitColumnsOf(answers)
  if (Object.keys(columns).length > 0) {
    unwrap(
      await db()
        .from('brand_kit')
        .upsert({ user_id: userId, account_id: accountId, ...columns, updated_at: now }, { onConflict: 'user_id,account_id' }),
    )
  }
  if (answers.postsPerWeek) await applyPostsPerWeek(userId, accountId, answers.postsPerWeek)
}

/** What the wizard needs besides the answers: the picked picture, and whether the confirmed username has a profile. */
export interface OnboardingExtras {
  avatarPath: string | null
  /** False for a username kept without a lookup: the brand then needs a name from the user. */
  hasProfile: boolean
}

export async function getOnboardingExtras(userId: string): Promise<OnboardingExtras> {
  const row = unwrap(await db().from('onboarding').select('avatar_path, ig_profile').eq('user_id', userId).maybeSingle()) as
    { avatar_path: string | null; ig_profile: { username?: unknown } | null } | null
  return { avatarPath: row?.avatar_path ?? null, hasProfile: typeof row?.ig_profile?.username === 'string' }
}

/**
 * "Ya, benar": the looked-up profile becomes the user's. `profile` and `avatarPath` come from the server's own
 * lookup, never from the client. An empty username clears it (Bukan, ganti / Saya tidak punya Instagram).
 */
export async function confirmInstagram(
  userId: string,
  confirmed: { username: string; profile: Record<string, unknown>; avatarPath: string | null } | null,
): Promise<void> {
  const now = new Date().toISOString()
  unwrap(
    await db().from('onboarding').upsert(
      {
        user_id: userId,
        ig_username: confirmed?.username ?? '',
        ig_verified: false,
        ig_profile: confirmed?.profile ?? null,
        avatar_path: confirmed?.avatarPath ?? null,
        ...(confirmed ? { no_instagram: false } : {}),
        updated_at: now,
      },
      { onConflict: 'user_id' },
    ),
  )
}

/** The picture the user picked as the logo: the Instagram one stays, an upload replaces it. */
export async function setOnboardingLogo(userId: string, path: string): Promise<void> {
  unwrap(await db().from('onboarding').update({ avatar_path: path, logo_choice: 'upload', updated_at: new Date().toISOString() }).eq('user_id', userId))
}

/**
 * The Instagram login proved which account is the user's: its username replaces what they typed. Also for a login
 * from the wizard's first step, before any answer is saved.
 */
export async function markInstagramVerified(userId: string, username: string): Promise<void> {
  unwrap(
    await db()
      .from('onboarding')
      .upsert({ user_id: userId, ig_username: username.toLowerCase(), ig_verified: true, no_instagram: false }, { onConflict: 'user_id' }),
  )
}

/**
 * The answered posts per week for an account that is already connected: it becomes the strategy's rhythm, or,
 * without a strategy yet, the posting slots, unless the owner already set their own.
 */
export async function applyPostsPerWeek(userId: string, accountId: string, postsPerWeek: number): Promise<void> {
  const strategy = await getAccountStrategy(userId, accountId)
  if (strategy) {
    if (strategy.postsPerWeek !== postsPerWeek) await saveStrategy(userId, accountId, { ...strategy, postsPerWeek })
    return
  }
  const { isCustom } = await getScheduleSettings(userId, accountId)
  if (!isCustom) await saveSlots(userId, accountId, generateSlots(postsPerWeek))
}

/** The finished wizard's answers, to seed a newly connected account's kit; null without a finished wizard. */
export async function getCompletedAnswers(userId: string): Promise<OnboardingAnswers | null> {
  const row = await loadRow(userId)
  return row?.completed_at ? answersOf(row) : null
}
