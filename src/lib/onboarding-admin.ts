import 'server-only'
import { listAdminUsers } from './admin'
import type { OnboardingRecord } from './onboarding-admin-options'
import { db, unwrap } from './supabase'

const MAX_ROWS = 1000
const EPOCH = '1970-01-01T00:00:00+00:00'

interface Row {
  user_id: string
  ig_username: string
  ig_verified: boolean
  no_instagram: boolean
  name: string
  ig_profile: { name?: unknown; followers?: unknown } | null
  goal: string
  website: string
  caption_language: string
  posts_per_week: number
  posts_last_month: string
  handler: string
  skill_level: string
  logo_choice: string
  referral_source: string
  last_step: string
  started_at: string
  completed_at: string | null
}

function tally<T extends { user_id: string }>(rows: T[], amount: (row: T) => number = () => 1): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + amount(row))
  return counts
}

/** Every user's onboarding with their trial use and paywall events, newest first. */
export async function listOnboardingRecords(): Promise<OnboardingRecord[]> {
  const [rows, users, contents, chats, revisions, events] = await Promise.all([
    db().from('onboarding').select(
      'user_id, ig_username, ig_verified, no_instagram, name, ig_profile, goal, website, caption_language, posts_per_week, ' +
      'posts_last_month, handler, skill_level, logo_choice, referral_source, last_step, started_at, completed_at',
    ).order('started_at', { ascending: false }).limit(MAX_ROWS).then((result) => unwrap(result) as unknown as Row[]),
    listAdminUsers(),
    db().from('credit_reservations').select('user_id').eq('cycle_start', EPOCH).neq('status', 'released').limit(10_000)
      .then((result) => unwrap(result) as { user_id: string }[]),
    db().from('sigap_daily_usage').select('user_id, used').eq('day', '1970-01-01').eq('task', 'chat').limit(10_000)
      .then((result) => unwrap(result) as { user_id: string; used: number }[]),
    db().from('trial_usage').select('user_id, used').eq('task', 'revision').limit(10_000)
      .then((result) => unwrap(result) as { user_id: string; used: number }[]),
    db().from('funnel_events').select('user_id, event').in('event', ['paywall_shown', 'paywall_cta']).limit(50_000)
      .then((result) => unwrap(result) as { user_id: string; event: string }[]),
  ])
  const byUser = new Map(users.map((user) => [user.id, user]))
  const contentUsed = tally(contents)
  const chatUsed = tally(chats, (row) => row.used)
  const revisionUsed = tally(revisions, (row) => row.used)
  const shown = tally(events.filter((event) => event.event === 'paywall_shown'))
  const clicked = tally(events.filter((event) => event.event === 'paywall_cta'))
  return rows.map((row) => {
    const user = byUser.get(row.user_id)
    return {
      userId: row.user_id,
      email: user?.email ?? '',
      igUsername: row.ig_username,
      igVerified: row.ig_verified,
      noInstagram: row.no_instagram,
      name: row.name || (typeof row.ig_profile?.name === 'string' ? row.ig_profile.name : ''),
      followers: typeof row.ig_profile?.followers === 'number' ? row.ig_profile.followers : null,
      goal: row.goal,
      website: row.website,
      captionLanguage: row.caption_language,
      postsPerWeek: row.posts_per_week,
      postsLastMonth: row.posts_last_month,
      handler: row.handler,
      skillLevel: row.skill_level,
      logoChoice: row.logo_choice,
      referralSource: row.referral_source,
      lastStep: row.last_step,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      contentUsed: contentUsed.get(row.user_id) ?? 0,
      chatUsed: chatUsed.get(row.user_id) ?? 0,
      revisionUsed: revisionUsed.get(row.user_id) ?? 0,
      paywallShown: shown.get(row.user_id) ?? 0,
      paywallClicked: clicked.get(row.user_id) ?? 0,
      paid: Boolean(user?.period),
    }
  })
}
