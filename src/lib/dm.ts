import 'server-only'
import { markDmSent } from './comments'
import type { MessageEvent } from './dm-webhook'
import { isProfileStale } from './inbox-rules'
import type { CustomerProfile, PrivateReply } from './instagram'
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
  /** When the owner last opened it; see isConversationUnread. */
  seenAt: Date | null
  /** A signed CDN link that expires: never log it. */
  profilePicUrl: string | null
  /** When the profile was last read from Instagram; see isProfileStale. */
  profileFetchedAt: Date | null
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
  seen_at: string | null
  profile_pic_url: string | null
  profile_fetched_at: string | null
}

interface MessageRow {
  mid: string
  from_customer: boolean
  text: string | null
  sent_at: string
}

const CONVERSATION_COLUMNS =
  'igsid, username, name, last_text, last_from_customer, last_message_at, last_incoming_at, seen_at, profile_pic_url, profile_fetched_at'

const toDate = (value: string | null) => (value ? new Date(value) : null)

function toConversation(row: ConversationRow): Conversation {
  return {
    igsid: row.igsid,
    username: row.username,
    name: row.name,
    lastText: row.last_text,
    lastFromCustomer: row.last_from_customer,
    lastMessageAt: new Date(row.last_message_at),
    lastIncomingAt: toDate(row.last_incoming_at),
    seenAt: toDate(row.seen_at),
    profilePicUrl: row.profile_pic_url,
    profileFetchedAt: toDate(row.profile_fetched_at),
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

/** The ids of the stored messages of these conversations sent at or after `since`. */
export async function listStoredMids(userId: string, igsids: readonly string[], since: Date): Promise<Set<string>> {
  if (igsids.length === 0) return new Set()
  // ponytail: one page of rows (PostgREST's max_rows); a message past it is recorded again, which stores nothing.
  const rows = unwrap(
    await db()
      .from('dm_messages')
      .select('mid')
      .eq('user_id', userId)
      .in('igsid', [...igsids])
      .gte('sent_at', since.toISOString()),
  ) as { mid: string }[]
  return new Set(rows.map((row) => row.mid))
}

/** Never read, or read over 3 days ago, when its picture link has likely expired. */
export async function needsProfile(userId: string, igsid: string): Promise<boolean> {
  const row = unwrap(
    await db()
      .from('dm_conversations')
      .select('profile_fetched_at')
      .eq('user_id', userId)
      .eq('igsid', igsid)
      .maybeSingle(),
  ) as { profile_fetched_at: string | null } | null
  return row !== null && isProfileStale(toDate(row.profile_fetched_at), new Date())
}

/** A username or name Instagram leaves out keeps the stored one, e.g. the username a private reply took from the comment. */
export async function saveProfile(userId: string, igsid: string, profile: CustomerProfile): Promise<void> {
  unwrap(
    await db()
      .from('dm_conversations')
      .update({
        ...(profile.username && { username: profile.username }),
        ...(profile.name && { name: profile.name }),
        profile_pic_url: profile.profilePicUrl,
        profile_fetched_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('igsid', igsid),
  )
}

/**
 * A profile read that failed (e.g. a customer who only got a private reply and hasn't written yet) waits the same
 * 3 days before the next try, so the inbox doesn't ask Instagram again on every visit.
 */
export async function markProfileTried(userId: string, igsid: string): Promise<void> {
  unwrap(
    await db()
      .from('dm_conversations')
      .update({ profile_fetched_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('igsid', igsid),
  )
}

/** A conversation the owner started with a private reply: its username comes from the comment. */
export async function nameConversation(userId: string, igsid: string, username: string): Promise<void> {
  unwrap(
    await db().from('dm_conversations').update({ username }).eq('user_id', userId).eq('igsid', igsid).is('username', null),
  )
}

/** After a private reply: the comment counts as answered, and the DM opens the commenter's conversation. */
export async function recordPrivateReply(
  userId: string,
  comment: { commentId: string; username: string | null },
  sent: PrivateReply,
  text: string,
): Promise<void> {
  await markDmSent(userId, comment.commentId)
  if (!sent.recipientId) return
  await recordMessage(userId, { mid: sent.messageId, igsid: sent.recipientId, fromCustomer: false, text, sentAt: new Date() })
  if (comment.username) await nameConversation(userId, sent.recipientId, comment.username)
}

export async function setConversationReadState(
  userId: string,
  accountId: string,
  igsid: string,
  read: boolean,
): Promise<void> {
  unwrap(
    await db()
      .from('dm_conversations')
      .update({ seen_at: read ? new Date().toISOString() : null })
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('igsid', igsid),
  )
}

export async function markConversationSeen(userId: string, accountId: string, igsid: string): Promise<void> {
  await setConversationReadState(userId, accountId, igsid, true)
}

/** The bell's Tandai semua dibaca. Only conversations the customer wrote last can be unread. */
export async function markAllConversationsSeen(userId: string, accountId: string): Promise<void> {
  unwrap(
    await db()
      .from('dm_conversations')
      .update({ seen_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('last_from_customer', true),
  )
}

/**
 * The account's inbox, newest first. `waitingOnly` keeps the conversations whose last message came from the customer;
 * `igsids` keeps only those conversations.
 */
export async function listConversations(
  userId: string,
  accountId: string,
  waitingOnly: boolean,
  igsids?: readonly string[],
): Promise<Conversation[]> {
  if (igsids?.length === 0) return []
  let query = db()
    .from('dm_conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .order('last_message_at', { ascending: false })
    .limit(CONVERSATION_LIMIT)
  if (waitingOnly) query = query.eq('last_from_customer', true)
  if (igsids) query = query.in('igsid', [...igsids])
  return (unwrap(await query) as ConversationRow[]).map(toConversation)
}

/** The bell's recent candidates: conversations that still wait for the owner, newest first. */
export async function listNotificationConversations(userId: string, accountId: string): Promise<Conversation[]> {
  return listConversations(userId, accountId, true)
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
