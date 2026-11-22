import 'server-only'
import { describeError } from './errors'
import { db, unwrap } from './supabase'

/** What users did on the way to paying; Admin › Onboarding counts them. `detail` is a step, a status or a trigger. */
export type FunnelEvent = 'onboarding_step' | 'ig_lookup' | 'ig_connect' | 'paywall_shown' | 'paywall_cta'

/** Records one event. Never throws: the funnel must not break what the user is doing. */
export async function logFunnel(userId: string, event: FunnelEvent, detail = ''): Promise<void> {
  try {
    unwrap(await db().from('funnel_events').insert({ user_id: userId, event, detail: detail.slice(0, 100) }))
  } catch (error) {
    console.error('[funnel] gagal mencatat:', describeError(error))
  }
}

/** How many times the user did `event` since `since`, for rate limits. */
export async function countFunnel(userId: string, event: FunnelEvent, since: Date): Promise<number> {
  const { count, error } = await db()
    .from('funnel_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event', event)
    .gte('created_at', since.toISOString())
  if (error || count === null) throw new Error(`Supabase: ${error?.message || 'funnel tidak terbaca'}`)
  return count
}
