import 'server-only'
import type { DmTemplate, Variables } from './dm-templates'
import type { MessageEvent } from './dm-webhook'
import type { CustomerProfile } from './instagram'
import { db, unwrap } from './supabase'

/** Meta accepts replies from the app until 24 hours after the customer's last message. */
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000
// ponytail: newest 100 conversations and the last 200 messages of one; paginate when an inbox outgrows them.
const CONVERSATION_LIMIT = 100
const MESSAGE_LIMIT = 200

export interface Conversation {
  igsid: string
  username: string | null
  name: string | null
  lastText: string | null
  /** True while the conversation waits for the owner's reply. */
  lastFromCustomer: boolean
  lastMessageAt: Date
  lastIncomingAt: Date | null
}

export interface DmMessage {
  mid: string
  fromCustomer: boolean
  text: string | null
  sentAt: Date
}

interface ConversationRow {
  igsid: string
  username: string | null
  name: string | null
  last_text: string | null
  last_from_customer: boolean
  last_message_at: string
  last_incoming_at: string | null
}

interface MessageRow {
  mid: string
  from_customer: boolean
  text: string | null
  sent_at: string
}

const CONVERSATION_COLUMNS = 'igsid, username, name, last_text, last_from_customer, last_message_at, last_incoming_at'

function toConversation(row: ConversationRow): Conversation {
  return {
    igsid: row.igsid,
    username: row.username,
    name: row.name,
    lastText: row.last_text,
    lastFromCustomer: row.last_from_customer,
    lastMessageAt: new Date(row.last_message_at),
    lastIncomingAt: row.last_incoming_at ? new Date(row.last_incoming_at) : null,
  }
}

export function isReplyWindowOpen(conversation: Conversation, now: Date): boolean {
  const { lastIncomingAt } = conversation
  return lastIncomingAt !== null && now.getTime() - lastIncomingAt.getTime() < REPLY_WINDOW_MS
}

/** Stores a message and updates its conversation. Returns false when the message was already stored. */
export async function recordMessage(userId: string, event: MessageEvent): Promise<boolean> {
  const stored: unknown = unwrap(
    await db().rpc('record_dm_message', {
      p_user_id: userId,
      p_mid: event.mid,
      p_igsid: event.igsid,
      p_from_customer: event.fromCustomer,
      p_text: event.text,
      p_sent_at: event.sentAt.toISOString(),
    }),
  )
  return stored === true
}

export async function needsProfile(userId: string, igsid: string): Promise<boolean> {
  const row = unwrap(
    await db().from('dm_conversations').select('username').eq('user_id', userId).eq('igsid', igsid).maybeSingle(),
  ) as { username: string | null } | null
  return row !== null && row.username === null
}

export async function saveProfile(userId: string, igsid: string, profile: CustomerProfile): Promise<void> {
  unwrap(await db().from('dm_conversations').update(profile).eq('user_id', userId).eq('igsid', igsid))
}

/** The account's inbox, newest first. `waitingOnly` keeps the conversations whose last message came from the customer. */
export async function listConversations(userId: string, accountId: string, waitingOnly: boolean): Promise<Conversation[]> {
  let query = db()
    .from('dm_conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .order('last_message_at', { ascending: false })
    .limit(CONVERSATION_LIMIT)
  if (waitingOnly) query = query.eq('last_from_customer', true)
  return (unwrap(await query) as ConversationRow[]).map(toConversation)
}

/** Null also when the conversation belongs to an account that isn't the connected one. */
export async function getConversation(userId: string, accountId: string, igsid: string): Promise<Conversation | null> {
  const row = unwrap(
    await db()
      .from('dm_conversations')
      .select(CONVERSATION_COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('igsid', igsid)
      .maybeSingle(),
  ) as ConversationRow | null
  return row && toConversation(row)
}

/** Oldest first, so the thread reads top to bottom. */
export async function listMessages(userId: string, igsid: string): Promise<DmMessage[]> {
  const rows = unwrap(
    await db()
      .from('dm_messages')
      .select('mid, from_customer, text, sent_at')
      .eq('user_id', userId)
      .eq('igsid', igsid)
      .order('sent_at', { ascending: false })
      .limit(MESSAGE_LIMIT),
  ) as MessageRow[]
  return rows.reverse().map((row) => ({
    mid: row.mid,
    fromCustomer: row.from_customer,
    text: row.text,
    sentAt: new Date(row.sent_at),
  }))
}

/** Oldest first: when two keywords match, the earlier template wins. */
export async function listTemplates(userId: string, accountId: string): Promise<DmTemplate[]> {
  return unwrap(
    await db()
      .from('dm_templates')
      .select('id, keyword, body')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: true }),
  ) as DmTemplate[]
}

/** Inserts when `id` is null. Returns false when the template to update no longer exists. */
export async function saveTemplate(
  userId: string,
  id: string | null,
  keyword: string | null,
  body: string,
): Promise<boolean> {
  if (id === null) {
    unwrap(await db().from('dm_templates').insert({ user_id: userId, keyword, body }))
    return true
  }
  const rows = unwrap(
    await db().from('dm_templates').update({ keyword, body }).eq('id', id).eq('user_id', userId).select('id'),
  ) as unknown[]
  return rows.length === 1
}

export async function deleteTemplate(userId: string, id: string): Promise<void> {
  unwrap(await db().from('dm_templates').delete().eq('id', id).eq('user_id', userId))
}

export async function getVariables(userId: string, accountId: string): Promise<Variables> {
  const row = unwrap(
    await db().from('dm_settings').select('variables').eq('user_id', userId).eq('account_id', accountId).maybeSingle(),
  ) as { variables: unknown } | null
  const stored = row?.variables
  if (typeof stored !== 'object' || stored === null) return {}
  return Object.fromEntries(
    Object.entries(stored).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

export async function saveVariables(userId: string, accountId: string, variables: Variables): Promise<void> {
  unwrap(
    await db()
      .from('dm_settings')
      .upsert({ user_id: userId, account_id: accountId, variables }, { onConflict: 'user_id,account_id' }),
  )
}
