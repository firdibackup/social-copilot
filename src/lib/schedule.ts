import 'server-only'
import { getAccountStrategy } from './brand'
import { describeError } from './errors'
import { generateSlots, readStoredSlots, type PostingSlot } from './schedule-slots'
import { DEFAULT_POSTS_PER_WEEK } from './strategy-options'
import { db, unwrap } from './supabase'

/** Posts in these states sit at their time: a slot at exactly that time is taken. */
const TAKING_STATUSES = ['scheduled', 'publishing', 'published']

export interface ScheduleSettings {
  slots: PostingSlot[]
  /** False while the account still follows the default from its Brand strategy. */
  isCustom: boolean
}

/**
 * The account's posting slots. Until the owner changes them, they follow the Brand strategy's posts per week
 * (or 3 without a strategy), spread by generateSlots.
 */
export async function getScheduleSettings(userId: string, accountId: string): Promise<ScheduleSettings> {
  const row = unwrap(
    await db().from('schedule_settings').select('slots').eq('user_id', userId).eq('account_id', accountId).maybeSingle(),
  ) as { slots: unknown } | null
  const stored = row ? readStoredSlots(row.slots) : null
  if (stored) return { slots: stored, isCustom: true }
  const strategy = await getAccountStrategy(userId, accountId).catch((error: unknown) => {
    console.error('[jadwal] strategi gagal dibaca:', describeError(error))
    return null
  })
  return { slots: generateSlots(strategy?.postsPerWeek ?? DEFAULT_POSTS_PER_WEEK), isCustom: false }
}

export async function saveSlots(userId: string, accountId: string, slots: readonly PostingSlot[]): Promise<void> {
  unwrap(
    await db()
      .from('schedule_settings')
      .upsert(
        { user_id: userId, account_id: accountId, slots, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,account_id' },
      ),
  )
}

/** The times of the account's scheduled and published posts in [from, to): the slots they take. */
export async function listTakenTimes(userId: string, accountId: string, from: Date, to: Date): Promise<Date[]> {
  const rows = unwrap(
    await db()
      .from('posts')
      .select('scheduled_at')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .in('status', TAKING_STATUSES)
      .gte('scheduled_at', from.toISOString())
      .lt('scheduled_at', to.toISOString()),
  ) as { scheduled_at: string }[]
  return rows.map((row) => new Date(row.scheduled_at))
}
