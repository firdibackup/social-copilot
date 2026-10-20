import 'server-only'
import { PERSON_COOLDOWN_HOURS, type AutoDmRule, type AutoDmRuleInput, type RunStep } from './auto-dm-rules'
import { db, unwrap } from './supabase'

// ponytail: the "Otomatis" filter reads the conversations of the newest 100 runs; page when automations grow.
const RUN_CONVERSATION_LIMIT = 100

interface RuleRow {
  id: string
  name: string
  is_active: boolean
  media_id: string | null
  match_any: boolean
  keywords: string[]
  whole_word: boolean
  dm_trigger: boolean
  public_reply: boolean
  public_replies: string[]
  opener: boolean
  opener_text: string
  opener_button: string
  follow_gate: boolean
  follow_text: string
  follow_button: string
  main_text: string
  link_button: boolean
  link_text: string
  link_url: string
  created_at: string
}

const RULE_COLUMNS =
  'id, name, is_active, media_id, match_any, keywords, whole_word, dm_trigger, public_reply, public_replies, opener, ' +
  'opener_text, opener_button, follow_gate, follow_text, follow_button, main_text, link_button, link_text, link_url, created_at'

const toRule = (row: RuleRow): AutoDmRule => ({
  id: row.id,
  isActive: row.is_active,
  createdAt: new Date(row.created_at),
  name: row.name,
  scope: row.media_id === null ? 'all' : 'one',
  mediaId: row.media_id,
  matchAny: row.match_any,
  keywords: row.keywords,
  wholeWord: row.whole_word,
  dmTrigger: row.dm_trigger,
  publicReply: row.public_reply,
  publicReplies: row.public_replies,
  opener: row.opener,
  openerText: row.opener_text,
  openerButton: row.opener_button,
  followGate: row.follow_gate,
  followText: row.follow_text,
  followButton: row.follow_button,
  mainText: row.main_text,
  linkButton: row.link_button,
  linkText: row.link_text,
  linkUrl: row.link_url,
})

const toRow = (rule: AutoDmRuleInput) => ({
  name: rule.name,
  media_id: rule.scope === 'one' ? rule.mediaId : null,
  match_any: rule.matchAny,
  keywords: rule.keywords,
  whole_word: rule.wholeWord,
  dm_trigger: rule.dmTrigger,
  public_reply: rule.publicReply,
  public_replies: rule.publicReplies,
  opener: rule.opener,
  opener_text: rule.openerText,
  opener_button: rule.openerButton,
  follow_gate: rule.followGate,
  follow_text: rule.followText,
  follow_button: rule.followButton,
  main_text: rule.mainText,
  link_button: rule.linkButton,
  link_text: rule.linkText,
  link_url: rule.linkUrl,
})

/** The account's rules, oldest first. `activeOnly` for the webhook. */
export async function listRules(userId: string, accountId: string, activeOnly = false): Promise<AutoDmRule[]> {
  let query = db()
    .from('auto_dm_rules')
    .select(RULE_COLUMNS)
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
  if (activeOnly) query = query.eq('is_active', true)
  return (unwrap(await query) as unknown as RuleRow[]).map(toRule)
}

/** Null also for a rule of an account that isn't the connected one. */
export async function getRule(userId: string, accountId: string, id: string): Promise<AutoDmRule | null> {
  const row = unwrap(
    await db()
      .from('auto_dm_rules')
      .select(RULE_COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('id', id)
      .maybeSingle(),
  ) as unknown as RuleRow | null
  return row && toRule(row)
}

/** Inserts when `id` is null (active, under the connected account). Returns false when the rule to update is gone. */
export async function saveRule(
  userId: string,
  accountId: string,
  id: string | null,
  rule: AutoDmRuleInput,
): Promise<boolean> {
  if (id === null) {
    unwrap(await db().from('auto_dm_rules').insert({ user_id: userId, ...toRow(rule) }))
    return true
  }
  const rows = unwrap(
    await db()
      .from('auto_dm_rules')
      .update({ ...toRow(rule), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .select('id'),
  ) as unknown[]
  return rows.length === 1
}

export async function setRuleActive(userId: string, accountId: string, id: string, active: boolean): Promise<boolean> {
  const rows = unwrap(
    await db()
      .from('auto_dm_rules')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .select('id'),
  ) as unknown[]
  return rows.length === 1
}

/** Its runs go with it. */
export async function deleteRule(userId: string, accountId: string, id: string): Promise<void> {
  unwrap(await db().from('auto_dm_rules').delete().eq('id', id).eq('user_id', userId).eq('account_id', accountId))
}

/** A comment or DM a rule answered, as its card shows it. */
export interface AutoDmRun {
  source: 'comment' | 'dm'
  username: string | null
  text: string
  step: RunStep
  error: string | null
  updatedAt: Date
}

interface RunRow {
  source: 'comment' | 'dm'
  username: string | null
  text: string
  step: RunStep
  error: string | null
  updated_at: string
}

const toRun = (row: RunRow): AutoDmRun => ({
  source: row.source,
  username: row.username,
  text: row.text,
  step: row.step,
  error: row.error,
  updatedAt: new Date(row.updated_at),
})

/** Each rule's most recent run. */
export async function latestRuns(userId: string, ruleIds: readonly string[]): Promise<Map<string, AutoDmRun>> {
  const runs = await Promise.all(
    ruleIds.map(async (ruleId) => {
      const row = unwrap(
        await db()
          .from('auto_dm_runs')
          .select('source, username, text, step, error, updated_at')
          .eq('user_id', userId)
          .eq('rule_id', ruleId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ) as RunRow | null
      return row ? [[ruleId, toRun(row)] as const] : []
    }),
  )
  return new Map(runs.flat())
}

export interface RunClaim {
  source: 'comment' | 'dm'
  /** The comment id or the DM's mid. */
  triggerId: string
  personId: string | null
  username: string | null
  text: string
}

/** Starts a run unless the comment or DM already started one or the rule answered this person today. */
export async function claimRun(userId: string, ruleId: string, claim: RunClaim): Promise<string | null> {
  const id: unknown = unwrap(
    await db().rpc('claim_auto_dm_run', {
      p_user_id: userId,
      p_rule_id: ruleId,
      p_source: claim.source,
      p_trigger_id: claim.triggerId,
      p_person_id: claim.personId,
      p_username: claim.username,
      p_text: claim.text,
      p_person_hours: PERSON_COOLDOWN_HOURS,
    }),
  )
  return typeof id === 'string' ? id : null
}

export interface RunUpdate {
  step: RunStep
  error: string | null
  /** The DM conversation, once the first DM is out. */
  igsid?: string | null
}

export async function updateRun(userId: string, runId: string, update: RunUpdate): Promise<void> {
  unwrap(
    await db()
      .from('auto_dm_runs')
      .update({
        step: update.step,
        error: update.error,
        ...(update.igsid && { igsid: update.igsid }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .eq('user_id', userId),
  )
}

/** A button tap moves the newest run of this rule in that conversation; a tap without one changes nothing. */
export async function updateConversationRun(
  userId: string,
  ruleId: string,
  igsid: string,
  update: RunUpdate,
): Promise<void> {
  const row = unwrap(
    await db()
      .from('auto_dm_runs')
      .select('id')
      .eq('user_id', userId)
      .eq('rule_id', ruleId)
      .eq('igsid', igsid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as { id: string } | null
  if (row) await updateRun(userId, row.id, update)
}

/** The conversations Auto DM talked in, for the inbox's "Otomatis" filter. */
export async function listAutoDmConversationIds(userId: string, accountId: string): Promise<string[]> {
  const rows = unwrap(
    await db()
      .from('auto_dm_runs')
      .select('igsid')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .not('igsid', 'is', null)
      .order('created_at', { ascending: false })
      .limit(RUN_CONVERSATION_LIMIT),
  ) as { igsid: string }[]
  return [...new Set(rows.map((row) => row.igsid))]
}
