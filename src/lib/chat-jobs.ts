import 'server-only'
import type { ContentLanguage, Locale } from './ai-language'
import { answerChat, persistableParts, summarizeChat, type UserTurn } from './chat-ai'
import { addMessage, getMessage, getSession, loadHistory } from './chat'
import type { ChatEvent } from './chat-options'
import { describeError } from './errors'
import { db, unwrap } from './supabase'

/**
 * Mimo answers in the background. The route stores the owner's message and a job; the worker (`npm run worker`)
 * claims the job, answers and stores the answer, so it arrives even when the owner closes the tab, and is not
 * bound to a web request's time limit. The chat follows the job (followChatJob) and picks it up again after a reload.
 */

/** How often the worker says it is still on a job; claim_chat_job retakes one silent for 90 seconds. */
const HEARTBEAT_MS = 20_000
/** How often a follower looks at the job. */
const FOLLOW_INTERVAL_MS = 700
/** A follower stops before the web request's limit; the chat then follows again. */
const FOLLOW_MAX_MS = 240_000

export interface ChatJobPayload {
  turn: UserTurn
  deepSearch: boolean
  /** The language Mimo answers the owner in, and the brand's content language. */
  language: Locale
  contentLanguage: ContentLanguage
  /** Whether this message started the conversation, for the chat's address bar. */
  created: boolean
}

interface ChatJobRow {
  id: string
  user_id: string
  account_id: string
  session_id: string
  user_message_id: string
  assistant_message_id: string | null
  payload: ChatJobPayload
  status: 'pending' | 'running' | 'done' | 'failed'
  tool: string | null
}

const COLUMNS = 'id, user_id, account_id, session_id, user_message_id, assistant_message_id, payload, status, tool'

/** Queues the answer to `userMessageId`. */
export async function enqueueChatJob(
  userId: string,
  accountId: string,
  sessionId: string,
  userMessageId: string,
  payload: ChatJobPayload,
): Promise<string> {
  const row = unwrap(
    await db()
      .from('chat_jobs')
      .insert({ user_id: userId, account_id: accountId, session_id: sessionId, user_message_id: userMessageId, payload })
      .select('id')
      .single(),
  ) as { id: string }
  return row.id
}

/** The conversation's job that is still waiting or being answered: one at a time, so answers keep their order. */
export async function getActiveChatJob(userId: string, sessionId: string): Promise<{ id: string; tool: string | null } | null> {
  const rows = unwrap(
    await db()
      .from('chat_jobs')
      .select('id, tool')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(1),
  ) as { id: string; tool: string | null }[]
  return rows[0] ?? null
}

async function loadJob(userId: string, id: string): Promise<ChatJobRow | null> {
  return unwrap(await db().from('chat_jobs').select(COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle()) as ChatJobRow | null
}

/** The worker's next job, or null when none waits. */
export async function claimChatJob(): Promise<ChatJobRow | null> {
  const rows = unwrap(await db().rpc('claim_chat_job')) as ChatJobRow[] | null
  return rows?.[0] ?? null
}

/**
 * Ends the job and drops what it held of the owner's message and attachments; only `created` stays, for the chat
 * that follows it. Only while the job is still running: a job retaken after 90 silent seconds is not ended twice.
 */
async function endJob(id: string, created: boolean, values: { status: 'done' | 'failed'; assistant_message_id?: string }): Promise<void> {
  unwrap(
    await db()
      .from('chat_jobs')
      .update({ ...values, payload: { created }, tool: null, finished_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'running'),
  )
}

/**
 * Answers one claimed job: Mimo's reply becomes a message of the conversation. Never throws: a failure ends the job
 * as failed, and the chat tells the owner. The summary of a long conversation is brought up to date afterwards.
 */
export async function processChatJob(job: ChatJobRow): Promise<void> {
  const { user_id: userId, account_id: accountId, payload } = job
  const beat = setInterval(() => {
    void db().from('chat_jobs').update({ claimed_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'running')
      .then(undefined, () => undefined)
  }, HEARTBEAT_MS)
  try {
    const session = await getSession(userId, accountId, job.session_id)
    if (!session) throw new Error('percakapan sudah dihapus')
    // The owner's message is already stored: Mimo gets it as this turn, not as history.
    const history = (await loadHistory(session)).filter((message) => message.id !== job.user_message_id)
    const reply = await answerChat({
      userId,
      accountId,
      session,
      history,
      turn: payload.turn,
      deepSearch: payload.deepSearch,
      language: payload.language,
      contentLanguage: payload.contentLanguage,
      onTool: (name) => {
        void db().from('chat_jobs').update({ tool: name }).eq('id', job.id).eq('status', 'running').then(undefined, () => undefined)
      },
    })
    // Signed profile pictures never enter the database, so the stored answer shows competitors without them.
    const assistant = await addMessage(userId, job.session_id, { role: 'assistant', content: reply.content, parts: persistableParts(reply.parts) })
    await endJob(job.id, payload.created, { status: 'done', assistant_message_id: assistant.id })
    await summarizeChat(userId, session, payload.language).catch((error: unknown) => console.error('[mimo] ringkasan gagal:', describeError(error)))
  } catch (error) {
    console.error('[mimo] jawaban gagal dibuat:', describeError(error))
    await endJob(job.id, payload.created === true, { status: 'failed' }).catch((failure: unknown) => console.error('[mimo] status pekerjaan gagal disimpan:', describeError(failure)))
  } finally {
    clearInterval(beat)
  }
}

/**
 * Follows a job for the chat: a `tool` event whenever Mimo starts another tool, then `done` with both messages or
 * `error`. Returns false when the time is up before the job ended: the chat follows again. `failed` is the text
 * the owner reads when the answer could not be made.
 */
export async function followChatJob(
  userId: string,
  jobId: string,
  send: (event: ChatEvent) => void,
  failed: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const until = Date.now() + FOLLOW_MAX_MS
  let tool: string | null = null
  while (Date.now() < until && !signal?.aborted) {
    const job = await loadJob(userId, jobId)
    if (!job) {
      send({ type: 'error', sessionId: '', message: failed })
      return true
    }
    if (job.status === 'failed') {
      send({ type: 'error', sessionId: job.session_id, message: failed })
      return true
    }
    if (job.status === 'done') {
      const [user, assistant] = await Promise.all([
        getMessage(userId, job.session_id, job.user_message_id),
        job.assistant_message_id ? getMessage(userId, job.session_id, job.assistant_message_id) : null,
      ])
      if (!user || !assistant) send({ type: 'error', sessionId: job.session_id, message: failed })
      else send({ type: 'done', sessionId: job.session_id, created: job.payload.created === true, user, assistant })
      return true
    }
    if (job.tool && job.tool !== tool) {
      tool = job.tool
      send({ type: 'tool', name: tool })
    }
    await new Promise((resolve) => setTimeout(resolve, FOLLOW_INTERVAL_MS))
  }
  return false
}
