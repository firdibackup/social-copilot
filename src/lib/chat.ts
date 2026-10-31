import 'server-only'
import type { Locale } from '@/i18n/locale-config'
import { AiLimitError } from './ai'
import { getCurrentPeriod } from './billing'
import {
  DAILY_LIMITS,
  historyRange,
  searchPattern,
  type BulkState,
  type ChatMessageView,
  type ChatPart,
  type ChatSessionView,
  type LimitedTask,
  type StatusItem,
} from './chat-options'
import { STATUS_LABELS, type PostStatus } from './post-status'
import { postLabel } from './posts'
import { db, unwrap } from './supabase'

// ponytail: the 50 newest conversations and a conversation's newest 300 messages; paginate if they outgrow them.
const SESSION_LIST_LIMIT = 50
const MESSAGE_LIST_LIMIT = 300
const MESSAGE_COLUMNS = 'id, role, content, parts, created_at'

export interface ChatSession {
  id: string
  title: string
  summary: string
  /** How many of the oldest messages the summary covers. */
  summarizedCount: number
}

interface MessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts: unknown
  created_at: string
}

const toMessage = (row: MessageRow): ChatMessageView => ({
  id: row.id,
  role: row.role,
  content: row.content,
  // Written only by the server, in the shapes of ChatPart.
  parts: Array.isArray(row.parts) ? (row.parts as ChatPart[]) : [],
  createdAt: row.created_at,
})

/** Atomically reserves one daily slot. The counter, unlike the audit log, must never fail open. */
export async function reserveDailyUsage(userId: string, task: LimitedTask): Promise<string> {
  const period = await getCurrentPeriod(userId)
  if (!period) throw new AiLimitError('Langganan tidak aktif. Buka halaman Langganan.')
  const limit = period.plan ? (task === 'chat' ? period.plan.chatDaily : period.plan.researchDaily) : DAILY_LIMITS[task]
  if (limit < 1) throw new AiLimitError(`Fitur ${task === 'chat' ? 'chat' : 'riset'} tidak tersedia pada paket ini.`)
  const reserved = unwrap(
    await db().rpc('reserve_billing_daily_usage', {
      p_user_id: userId,
      p_task: task,
      p_limit: limit,
    }),
  )
  if (typeof reserved !== 'string') throw new AiLimitError(`Batas ${task === 'chat' ? 'chat' : 'riset'} tercapai (${limit}/hari). Reset pukul 00.00 WIB.`)
  return reserved
}

export async function releaseDailyUsage(userId: string, task: LimitedTask, day: string): Promise<void> {
  unwrap(await db().rpc('release_sigap_daily_usage', { p_user_id: userId, p_task: task, p_day: day }))
}

/** The account's conversations, most recently used first. */
export async function listSessions(userId: string, accountId: string): Promise<ChatSessionView[]> {
  const rows = unwrap(
    await db()
      .from('chat_sessions')
      .select('id, title, updated_at')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(SESSION_LIST_LIMIT),
  ) as { id: string; title: string; updated_at: string }[]
  return rows.map((row) => ({ id: row.id, title: row.title || 'Chat baru', updatedAt: row.updated_at }))
}

export async function getSession(userId: string, accountId: string, id: string): Promise<ChatSession | null> {
  const row = unwrap(
    await db()
      .from('chat_sessions')
      .select('id, title, summary_text, summarized_count')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .maybeSingle(),
  ) as { id: string; title: string; summary_text: string; summarized_count: number } | null
  return row && { id: row.id, title: row.title, summary: row.summary_text, summarizedCount: row.summarized_count }
}

export async function createSession(userId: string, accountId: string, title: string): Promise<ChatSession> {
  const row = unwrap(
    await db().from('chat_sessions').insert({ user_id: userId, account_id: accountId, title }).select('id').single(),
  ) as { id: string }
  return { id: row.id, title, summary: '', summarizedCount: 0 }
}

export async function deleteSession(userId: string, accountId: string, id: string): Promise<void> {
  unwrap(await db().from('chat_sessions').delete().eq('id', id).eq('user_id', userId).eq('account_id', accountId))
}

/** The conversation's newest messages, oldest first, for the page. */
export async function listMessages(userId: string, sessionId: string): Promise<ChatMessageView[]> {
  const rows = unwrap(
    await db()
      .from('chat_messages')
      .select(MESSAGE_COLUMNS)
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MESSAGE_LIST_LIMIT),
  ) as MessageRow[]
  return rows.reverse().map(toMessage)
}

async function countMessages(sessionId: string): Promise<number> {
  const { count, error } = await db()
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  if (error || count === null) throw new Error(`Supabase: ${error?.message || 'pesan tidak terhitung'}`)
  return count
}

/** Messages by position, oldest first: `from` and `to` count from the conversation's first message. */
async function messageRange(sessionId: string, from: number, to: number): Promise<ChatMessageView[]> {
  const rows = unwrap(
    await db()
      .from('chat_messages')
      .select(MESSAGE_COLUMNS)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  ) as MessageRow[]
  return rows.map(toMessage)
}

/** What the model gets verbatim besides the summary: the messages the summary doesn't cover yet. */
export async function loadHistory(session: ChatSession): Promise<ChatMessageView[]> {
  const range = historyRange(await countMessages(session.id), session.summarizedCount)
  return range ? messageRange(session.id, range.from, range.to) : []
}

/** The next messages to fold into the summary, or null when it isn't time yet. */
export async function loadSummaryBatch(
  session: ChatSession,
  batch: (total: number, summarizedCount: number) => { from: number; to: number } | null,
): Promise<ChatMessageView[] | null> {
  const range = batch(await countMessages(session.id), session.summarizedCount)
  return range ? messageRange(session.id, range.from, range.to) : null
}

export async function addMessage(
  userId: string,
  sessionId: string,
  message: Pick<ChatMessageView, 'role' | 'content' | 'parts'>,
): Promise<ChatMessageView> {
  const row = unwrap(
    await db()
      .from('chat_messages')
      .insert({ session_id: sessionId, user_id: userId, ...message })
      .select(MESSAGE_COLUMNS)
      .single(),
  ) as MessageRow
  unwrap(
    await db().from('chat_sessions').update({ updated_at: row.created_at }).eq('id', sessionId).eq('user_id', userId),
  )
  return toMessage(row)
}

/** One of the owner's messages in a conversation, for a card's button. Null when it is gone or not theirs. */
export async function getMessage(userId: string, sessionId: string, id: string): Promise<ChatMessageView | null> {
  const row = unwrap(
    await db()
      .from('chat_messages')
      .select(MESSAGE_COLUMNS)
      .eq('id', id)
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle(),
  ) as MessageRow | null
  return row && toMessage(row)
}

const FOUND_LIMIT = 5

/** Posts and ideas of the account whose title (or a post's caption) has the words, newest first. */
export async function findContent(userId: string, accountId: string, query: string, locale: Locale = 'id'): Promise<StatusItem[]> {
  const pattern = searchPattern(query)
  if (!pattern) return []
  const [posts, ideas] = await Promise.all([
    db()
      .from('posts')
      .select('id, title, caption, status')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .or(`title.ilike.${pattern},caption.ilike.${pattern}`)
      .order('updated_at', { ascending: false })
      .limit(FOUND_LIMIT),
    db()
      .from('content_ideas')
      .select('id, title, script')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .ilike('title', pattern)
      .order('created_at', { ascending: false })
      .limit(FOUND_LIMIT),
  ])
  const postRows = unwrap(posts) as { id: string; title: string; caption: string; status: PostStatus }[]
  const ideaRows = unwrap(ideas) as { id: string; title: string; script: unknown }[]
  return [
    ...postRows.map((row): StatusItem => ({ kind: 'post', id: row.id, title: postLabel(row, locale), status: STATUS_LABELS[row.status] })),
    ...ideaRows.map(
      (row): StatusItem => ({
        kind: 'idea',
        id: row.id,
        title: row.title,
        status: Array.isArray(row.script) ? `Ide · skrip siap ${row.script.length} slide` : 'Ide · belum ada skrip',
      }),
    ),
  ]
}

export type CardResolution = 'saved' | 'cancelled' | 'discarded' | 'already' | 'not_found'

/** Atomically applies a confirmed side effect and changes only that confirmation card. */
export async function resolveConfirmation(
  userId: string,
  accountId: string,
  messageId: string,
  confirmId: string,
  kind: 'strategy' | 'auto_dm_rule',
  payload: unknown,
  accept: boolean,
): Promise<CardResolution> {
  return unwrap(
    await db().rpc('resolve_sigap_confirmation', {
      p_user_id: userId,
      p_account_id: accountId,
      p_message_id: messageId,
      p_confirm_id: confirmId,
      p_kind: kind,
      p_payload: payload,
      p_accept: accept,
    }),
  ) as CardResolution
}

/**
 * Moves one bulk_content card on from `from`, merging `patch` into it, under the message's row lock. 'already' when
 * another request moved it first: the caller then does nothing, so a double click charges nothing twice.
 */
export async function updateBulkCard(
  userId: string,
  accountId: string,
  messageId: string,
  bulkId: string,
  from: BulkState,
  patch: Partial<Extract<ChatPart, { type: 'bulk' }>> & { state: BulkState },
): Promise<'ok' | 'already' | 'not_found'> {
  return unwrap(
    await db().rpc('update_sigap_bulk', {
      p_user_id: userId,
      p_account_id: accountId,
      p_message_id: messageId,
      p_bulk_id: bulkId,
      p_from: from,
      p_patch: patch,
    }),
  ) as 'ok' | 'already' | 'not_found'
}

/** Atomically deletes one account-scoped idea and changes only its script card. */
export async function discardScript(
  userId: string,
  accountId: string,
  messageId: string,
  ideaId: string,
): Promise<CardResolution> {
  return unwrap(
    await db().rpc('discard_sigap_script', {
      p_user_id: userId,
      p_account_id: accountId,
      p_message_id: messageId,
      p_idea_id: ideaId,
    }),
  ) as CardResolution
}

/**
 * Stores the new summary unless another one landed first (two answers finishing together): then this one is
 * dropped, and the next answer tries again.
 */
export async function saveSummary(sessionId: string, summary: string, previousCount: number, newCount: number): Promise<void> {
  unwrap(
    await db()
      .from('chat_sessions')
      .update({ summary_text: summary, summarized_count: newCount })
      .eq('id', sessionId)
      .eq('summarized_count', previousCount),
  )
}
