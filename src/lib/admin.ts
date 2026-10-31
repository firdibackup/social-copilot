
import { getTranslations } from 'next-intl/server'
import 'server-only'
import type { User } from '@supabase/supabase-js'
import type { SessionUser } from './auth'
import { grantFreePeriod, listPayments, type Payment } from './billing'
import { describeError } from './errors'
import type { UnfinishedPayment } from './payment-followup-options'
import { db, unwrap } from './supabase'

const DAY_MS = 24 * 60 * 60 * 1000
const USAGE_DAYS = 30
const PAGE_SIZE = 1000
/** listUsers pages; 10,000 users is far beyond this app's size. */
const MAX_PAGES = 10
const RECENT_LIMIT = 20
/** A ban Supabase Auth keeps for about a century, i.e. until lifted. */
const BAN_DURATION = '876000h'
const STORAGE_BUCKETS = ['media', 'brand']

/** An admin action refused for a reason the admin can act on. The message is shown as it is. */
export class AdminError extends Error {
  override name = 'AdminError'
}

export interface AdminUser {
  id: string
  email: string
  createdAt: Date
  lastSignInAt: Date | null
  /** Set while the account is blocked. */
  bannedUntil: Date | null
  instagram: { username: string; status: string } | null
  /** End of the last paid period, past or future; null when the user never had one. */
  activeUntil: Date | null
  /** The paid period covering now. */
  period: { start: Date; end: Date } | null
  /** Credits spent in that period, adjustments included. */
  creditsUsed: number | null
  creditsTotal?: number | null
  planName?: string | null
}

export interface Generation {
  createdAt: Date
  task: string
  model: string
  status: 'ok' | 'failed'
  credits: number
  error: string | null
  durationMs: number
}

export interface Adjustment {
  createdAt: Date
  amount: number
  note: string | null
}

export interface AdminUserDetail extends AdminUser {
  payments: Payment[]
  generations: Generation[]
  adjustments: Adjustment[]
  posts: number
}

export interface ModelUsage {
  model: string
  requests: number
  failed: number
  credits: number
  users: number
}

export interface Failure {
  createdAt: Date
  task: string
  model: string
  error: string | null
  email: string
}

export interface LogEntry {
  createdAt: Date
  adminEmail: string
  targetEmail: string | null
  action: string
  detail: Record<string, unknown>
}

export interface AdminOverview {
  users: number
  activeUsers: number
  usageDays: number
  usage: ModelUsage[]
  failures: Failure[]
  log: LogEntry[]
}

interface OverviewRow {
  credits_total?: number | null
  plan_name?: string | null
  user_id: string
  active_until: string
  period_start: string | null
  period_end: string | null
  credits_used: number | null
}

interface GenerationRow {
  created_at: string
  task: string
  model: string
  status: 'ok' | 'failed'
  credits: number
  error: string | null
  duration_ms: number
}

const toDate = (value: string | null | undefined) => (value ? new Date(value) : null)

/** A ban in the past (Supabase keeps the column after a ban expires) is no ban. */
function bannedUntil(user: User, now: Date): Date | null {
  const until = toDate((user as User & { banned_until?: string | null }).banned_until)
  return until && until > now ? until : null
}

async function allAuthUsers(): Promise<User[]> {
  const users: User[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw new Error(`Supabase Auth: ${error.message}`)
    users.push(...data.users)
    if (data.users.length < PAGE_SIZE) break
  }
  return users
}

async function authUser(userId: string): Promise<User> {
  const t = await getTranslations('admin')

  const { data, error } = await db().auth.admin.getUserById(userId)
  if (error || !data.user) throw new AdminError(t('admin.userNotFound'))
  return data.user
}

async function overviewRows(userId?: string): Promise<Map<string, OverviewRow>> {
  const rows = unwrap(await db().rpc('billing_admin_overview', userId ? { p_user_id: userId } : {})) as OverviewRow[]
  return new Map(rows.map((row) => [row.user_id, row]))
}

async function instagramAccounts(userIds?: string[]): Promise<Map<string, { username: string; status: string }>> {
  let query = db().from('instagram_connections').select('user_id, username, status')
  if (userIds) query = query.in('user_id', userIds)
  const rows = unwrap(await query) as { user_id: string; username: string; status: string }[]
  return new Map(rows.map((row) => [row.user_id, { username: row.username, status: row.status }]))
}

function toAdminUser(
  user: User,
  overview: OverviewRow | undefined,
  instagram: { username: string; status: string } | undefined,
  now: Date,
): AdminUser {
  const start = toDate(overview?.period_start)
  const end = toDate(overview?.period_end)
  return {
    id: user.id,
    email: user.email ?? '',
    createdAt: new Date(user.created_at),
    lastSignInAt: toDate(user.last_sign_in_at),
    bannedUntil: bannedUntil(user, now),
    instagram: instagram ?? null,
    activeUntil: toDate(overview?.active_until),
    period: start && end ? { start, end } : null,
    creditsUsed: overview?.credits_used ?? null,
    creditsTotal: overview?.credits_total ?? null,
    planName: overview?.plan_name ?? null,
  }
}

/** Every user, newest first, narrowed by `query` against the email and the Instagram username. */
export async function listAdminUsers(query = '', now = new Date()): Promise<AdminUser[]> {
  const [users, overview, instagram] = await Promise.all([allAuthUsers(), overviewRows(), instagramAccounts()])
  const needle = query.trim().toLowerCase()
  return users
    .map((user) => toAdminUser(user, overview.get(user.id), instagram.get(user.id), now))
    .filter(
      (user) =>
        !needle || user.email.toLowerCase().includes(needle) || (user.instagram?.username.toLowerCase().includes(needle) ?? false),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function getAdminUser(userId: string, now = new Date()): Promise<AdminUserDetail> {
  const user = await authUser(userId)
  const [overview, instagram, payments, generations, adjustments, posts] = await Promise.all([
    overviewRows(userId),
    instagramAccounts([userId]),
    listPayments(userId),
    db()
      .from('ai_generations')
      .select('created_at, task, model, status, credits, error, duration_ms')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
    db()
      .from('credit_adjustments')
      .select('created_at, amount, note')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
    db().from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  if (posts.error) throw new Error(`Supabase: ${posts.error.message}`)
  return {
    ...toAdminUser(user, overview.get(userId), instagram.get(userId), now),
    payments,
    generations: (unwrap(generations) as GenerationRow[]).map((row) => ({
      createdAt: new Date(row.created_at),
      task: row.task,
      model: row.model,
      status: row.status,
      credits: row.credits,
      error: row.error,
      durationMs: row.duration_ms,
    })),
    adjustments: (unwrap(adjustments) as { created_at: string; amount: number; note: string | null }[]).map((row) => ({
      createdAt: new Date(row.created_at),
      amount: row.amount,
      note: row.note,
    })),
    posts: posts.count ?? 0,
  }
}

export async function getAdminOverview(now = new Date()): Promise<AdminOverview> {
  const t = await getTranslations('admin')

  const since = new Date(now.getTime() - USAGE_DAYS * DAY_MS)
  const [users, overview, usage, failures, log] = await Promise.all([
    allAuthUsers(),
    overviewRows(),
    db().rpc('admin_ai_usage', { p_since: since.toISOString() }),
    db()
      .from('ai_generations')
      .select('created_at, task, model, error, user_id')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(10),
    db()
      .from('admin_log')
      .select('created_at, admin_id, target_email, action, detail')
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
  ])
  const emails = new Map(users.map((user) => [user.id, user.email ?? '']))
  return {
    users: users.length,
    activeUsers: [...overview.values()].filter((row) => row.period_start !== null).length,
    usageDays: USAGE_DAYS,
    usage: unwrap(usage) as ModelUsage[],
    failures: (
      unwrap(failures) as { created_at: string; task: string; model: string; error: string | null; user_id: string }[]
    ).map((row) => ({
      createdAt: new Date(row.created_at),
      task: row.task,
      model: row.model,
      error: row.error,
      email: emails.get(row.user_id) ?? t('admin.deleted'),
    })),
    log: (
      unwrap(log) as {
        created_at: string
        admin_id: string | null
        target_email: string | null
        action: string
        detail: Record<string, unknown>
      }[]
    ).map((row) => ({
      createdAt: new Date(row.created_at),
      adminEmail: (row.admin_id && emails.get(row.admin_id)) || t('admin.deleted'),
      targetEmail: row.target_email,
      action: row.action,
      detail: row.detail,
    })),
  }
}

/** How far back the follow-up list looks. Older abandoned checkouts are not worth a chat. */
export const FOLLOWUP_DAYS = 14
const FOLLOWUP_LIMIT = 500

interface UnfinishedRow {
  id: string
  user_id: string
  amount: number
  status: 'pending' | 'expired'
  kind: 'subscription' | 'upgrade'
  created_at: string
  expires_at: string | null
  link: string | null
  snapshot: { plan?: { name?: string }; months?: number; coupon?: { code?: string } } | null
  customer_name: string | null
  customer_whatsapp: string | null
  reminded_at: string | null
  reminder_count: number
}

/**
 * Users whose last Mayar checkout in the window is unfinished: one row each, the latest checkout, newest first. A user
 * who paid after it is done and drops out. A link past its expiry counts as expired even before the sweep marks it.
 */
export async function listUnfinishedPayments(now = new Date()): Promise<UnfinishedPayment[]> {
  const since = new Date(now.getTime() - FOLLOWUP_DAYS * DAY_MS).toISOString()
  const [unfinished, paid, users] = await Promise.all([
    db().from('payments')
      .select('id, user_id, amount, status, kind, created_at, expires_at, link, snapshot, customer_name, customer_whatsapp, reminded_at, reminder_count')
      .in('status', ['pending', 'expired']).not('mayar_id', 'is', null).gt('created_at', since)
      .order('created_at', { ascending: false }).limit(FOLLOWUP_LIMIT),
    // Free grants don't count as having paid, but a 100% coupon does: that user finished checking out.
    db().from('payments').select('user_id, created_at').eq('status', 'paid').or('amount.gt.0,coupon_id.not.is.null').gt('created_at', since),
    allAuthUsers(),
  ])
  const lastPaid = new Map<string, number>()
  for (const row of unwrap(paid) as { user_id: string; created_at: string }[]) {
    lastPaid.set(row.user_id, Math.max(lastPaid.get(row.user_id) ?? 0, new Date(row.created_at).getTime()))
  }
  const emails = new Map(users.map((user) => [user.id, user.email ?? '']))
  const byUser = new Map<string, { row: UnfinishedRow; attempts: number; contact: Pick<UnfinishedRow, 'customer_name' | 'customer_whatsapp'> }>()
  for (const row of unwrap(unfinished) as UnfinishedRow[]) {
    if (!emails.has(row.user_id) || (lastPaid.get(row.user_id) ?? 0) > new Date(row.created_at).getTime()) continue
    const seen = byUser.get(row.user_id)
    if (seen) {
      seen.attempts++
      // An older checkout may have the number when the latest predates the form.
      if (!seen.contact.customer_whatsapp && row.customer_whatsapp) seen.contact = row
    } else byUser.set(row.user_id, { row, attempts: 1, contact: row })
  }
  return [...byUser.values()].map(({ row, attempts, contact }) => {
    const expiresAt = toDate(row.expires_at)
    return {
      paymentId: row.id,
      userId: row.user_id,
      email: emails.get(row.user_id) ?? '',
      name: contact.customer_name,
      whatsapp: contact.customer_whatsapp,
      planName: row.snapshot?.plan?.name ?? null,
      months: typeof row.snapshot?.months === 'number' ? row.snapshot.months : null,
      couponCode: row.snapshot?.coupon?.code ?? null,
      kind: row.kind,
      amount: row.amount,
      status: row.status === 'pending' && (!expiresAt || expiresAt > now) ? 'pending' : 'expired',
      createdAt: new Date(row.created_at),
      expiresAt,
      link: row.link,
      remindedAt: toDate(row.reminded_at),
      reminderCount: row.reminder_count,
      attempts,
    }
  })
}

/** Records that an admin opened a WhatsApp follow-up for a payment. */
export async function markPaymentReminded(admin: SessionUser, paymentId: string): Promise<number> {
  const t = await getTranslations('admin')

  const [row] = unwrap(await db().from('payments').select('user_id, amount').eq('id', paymentId).limit(1)) as { user_id: string; amount: number }[]
  if (!row) throw new AdminError(t('admin.paymentNotFound'))
  const count: unknown = unwrap(await db().rpc('mark_payment_reminded', { p_id: paymentId }))
  if (typeof count !== 'number') throw new AdminError(t('admin.thisPaymentIsAlreadyPaid'))
  const user = await authUser(row.user_id).catch(() => null)
  await logAdminAction(admin, 'remind_payment', user ? targetOf(user) : null, { paymentId, reminder: count })
  return count
}

export type AdminAction =
  | 'grant_days'
  | 'end_subscription'
  | 'adjust_credits'
  | 'reset_credits'
  | 'set_password'
  | 'ban'
  | 'unban'
  | 'delete_user'
  | 'save_settings'
  | 'upload_template'
  | 'import_templates'
  | 'analyze_templates'
  | 'update_template'
  | 'toggle_template'
  | 'delete_template'
  | 'remind_payment'
  | 'create_coupon'
  | 'update_coupon'
  | 'toggle_coupon'
  | 'delete_coupon'

/** Records what an admin did. A log that can't be written doesn't undo the action. */
export async function logAdminAction(
  admin: SessionUser,
  action: AdminAction,
  target: { id: string; email: string } | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    unwrap(
      await db()
        .from('admin_log')
        .insert({ admin_id: admin.id, target_user_id: target?.id ?? null, target_email: target?.email ?? null, action, detail }),
    )
  } catch (error) {
    console.error('[admin] log gagal ditulis:', describeError(error))
  }
}

const targetOf = (user: User) => ({ id: user.id, email: user.email ?? '' })

function refuseSelf(admin: SessionUser, userId: string, message: string): void {
  if (admin.id === userId) throw new AdminError(message)
}

/** Free subscription days, stacked after any period the user already has. */
export async function grantDays(admin: SessionUser, userId: string, days: number): Promise<void> {
  const user = await authUser(userId)
  await grantFreePeriod(userId, days)
  await logAdminAction(admin, 'grant_days', targetOf(user), { days })
}

/** Ends the current period now and cancels periods paid ahead. */
export async function endSubscription(admin: SessionUser, userId: string): Promise<void> {
  const t = await getTranslations('admin')

  refuseSelf(admin, userId, t('admin.youCanTEndYourOwnSubscription'))
  const user = await authUser(userId)
  const changed: unknown = unwrap(await db().rpc('admin_end_subscription', { p_user_id: userId }))
  if (changed === 0) throw new AdminError(t('admin.thisUserHasNoActiveSubscription'))
  await logAdminAction(admin, 'end_subscription', targetOf(user), { periods: changed })
}

/**
 * Gives credits back (positive) or takes them (negative) in the current period. Without one there is nothing to
 * adjust: credits_used() counts from the start of the next period, so the row would never count.
 */
export async function adjustCredits(admin: SessionUser, userId: string, amount: number, note: string | null): Promise<void> {
  const t = await getTranslations('admin')

  const user = await authUser(userId)
  if (!(await overviewRows(userId)).get(userId)?.period_start) {
    throw new AdminError(t('admin.thisUserHasNoActivePeriodSo'))
  }
  unwrap(await db().from('credit_adjustments').insert({ user_id: userId, amount, note, created_by: admin.id }))
  await logAdminAction(admin, 'adjust_credits', targetOf(user), { amount, note })
}

/** Gives back everything spent in the current period, so the user starts it again at 0%. */
export async function resetCredits(admin: SessionUser, userId: string): Promise<void> {
  const t = await getTranslations('admin')

  const user = await authUser(userId)
  const overview = (await overviewRows(userId)).get(userId)
  if (!overview?.period_start) throw new AdminError(t('admin.thisUserHasNoActivePeriod'))
  const used = overview.credits_used ?? 0
  if (used <= 0) throw new AdminError(t('admin.noCreditsHaveBeenUsedThisPeriod'))
  unwrap(
    await db()
      .from('credit_adjustments')
      .insert({ user_id: userId, amount: used, note: 'Reset pemakaian periode', created_by: admin.id }),
  )
  await logAdminAction(admin, 'reset_credits', targetOf(user), { amount: used })
}

/** There is no SMTP, so a forgotten password is reset here and handed over by the admin. */
export async function setPassword(admin: SessionUser, userId: string, password: string): Promise<void> {
  const t = await getTranslations('admin')

  const user = await authUser(userId)
  const { error } = await db().auth.admin.updateUserById(userId, { password })
  if (error) {
    if (error.code === 'weak_password') throw new AdminError(t('admin.passwordIsTooWeakUseACombination'))
    throw new Error(`Supabase Auth: ${error.message}`)
  }
  await logAdminAction(admin, 'set_password', targetOf(user))
}

/**
 * Blocks sign-in. A session already open lasts until its token expires (an hour at most); scheduled posts still go
 * out while the subscription is active, so end that too to stop them.
 */
export async function setBanned(admin: SessionUser, userId: string, banned: boolean): Promise<void> {
  const t = await getTranslations('admin')

  if (banned) refuseSelf(admin, userId, t('admin.youCanTBlockYourOwnAccount'))
  const user = await authUser(userId)
  const { error } = await db().auth.admin.updateUserById(userId, { ban_duration: banned ? BAN_DURATION : 'none' })
  if (error) throw new Error(`Supabase Auth: ${error.message}`)
  await logAdminAction(admin, banned ? 'ban' : 'unban', targetOf(user))
}

/** Every Storage object under `prefix`, folders included. */
async function listObjects(bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await db().storage.from(bucket).list(prefix, { limit: PAGE_SIZE })
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  const paths: string[] = []
  for (const item of data) {
    const path = `${prefix}/${item.name}`
    // Folders come back without an id.
    if (item.id === null) paths.push(...(await listObjects(bucket, path)))
    else paths.push(path)
  }
  return paths
}

/**
 * Deletes the user and, through the cascades, all their rows. Their files go afterwards, best effort: the account is
 * what matters, and files left over are only storage. `confirmEmail` must match, so a slip of the hand can't do it.
 */
export async function deleteUser(admin: SessionUser, userId: string, confirmEmail: string): Promise<void> {
  const t = await getTranslations('admin')

  refuseSelf(admin, userId, t('admin.youCanTDeleteYourOwnAccount'))
  const user = await authUser(userId)
  if (!user.email || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new AdminError(t('admin.typeTheUserSExactEmailTo'))
  }
  const { error } = await db().auth.admin.deleteUser(userId)
  if (error) throw new Error(`Supabase Auth: ${error.message}`)
  await logAdminAction(admin, 'delete_user', targetOf(user))

  for (const bucket of STORAGE_BUCKETS) {
    try {
      const paths = await listObjects(bucket, userId)
      if (paths.length > 0) unwrap(await db().storage.from(bucket).remove(paths))
    } catch (error) {
      console.error(`[admin] file ${bucket} pengguna terhapus gagal dibersihkan:`, describeError(error))
    }
  }
}
