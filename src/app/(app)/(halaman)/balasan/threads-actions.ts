'use server'

import { refresh } from 'next/cache'
import { aiErrorMessage } from '@/lib/ai'
import { requireAccount } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { InstagramApiError } from '@/lib/instagram'
import { draftReply, REPLY_CONTEXT_MESSAGES } from '@/lib/reply-ai'
import { threadsLength, THREADS_TEXT_LIMIT } from '@/lib/thread-items'
import { createThreadsContainer, getThreadsContainer, publishThreadsContainer, setThreadsReplyHidden } from '@/lib/threads'
import { getThreadsAccount, markThreadsNeedsReconnect, ThreadsReconnectError } from '@/lib/threads-connection'
import {
  getThreadsBranch,
  getThreadsReply,
  listThreadsPosts,
  markThreadsPostSeen,
  recordOwnThreadsReply,
  setThreadsReplyHiddenRow,
} from '@/lib/threads-inbox'
import { MissingThreadsRepliesPermissionError, syncThreadsReplies } from '@/lib/threads-sync'
import { text, type ActionError, type DraftResult, type SyncState } from './action-utils'

const NUMERIC_ID = /^\d+$/
const NOT_FOUND = 'Balasan tidak ditemukan.'
const RECONNECT = 'Threads belum terhubung atau tokennya kedaluwarsa. Hubungkan ulang di Pengaturan.'
const MISSING_PERMISSION = 'Komentar Threads butuh izin membaca balasan. Hubungkan ulang Threads sekali.'
/** A text reply's container is usually ready at once. */
const READY_CHECKS = 5
const READY_DELAY_MS = 1_000

const idOf = (value: unknown) => (typeof value === 'string' && NUMERIC_ID.test(value) ? value : null)

/** Owner-facing text for a Threads call that failed. */
async function threadsErrorMessage(userId: string, error: unknown, context: string): Promise<string> {
  if (error instanceof ThreadsReconnectError) return RECONNECT
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markThreadsNeedsReconnect(userId)
    return RECONNECT
  }
  console.error(`[balasan] ${context}:`, describeError(error))
  return error instanceof InstagramApiError
    ? `Threads menolak: ${error.message}`
    : 'Threads atau database tidak bisa dihubungi. Coba lagi.'
}

/** Whether a reply's container can be published yet; one Threads couldn't process is refused. */
async function isReady(accessToken: string, containerId: string): Promise<boolean> {
  for (let check = 1; check <= READY_CHECKS; check++) {
    const { status, errorMessage } = await getThreadsContainer(accessToken, containerId)
    if (status === 'FINISHED') return true
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new InstagramApiError(`balasan gagal diproses (${errorMessage ?? status})`, null, 400)
    }
    if (check < READY_CHECKS) await new Promise((resolve) => setTimeout(resolve, READY_DELAY_MS))
  }
  return false
}

/** Opening the Threads view of Komentar and Muat ulang: pulls replies of the last 30 days, at most every 10 minutes. */
export async function syncThreadsRepliesAction(): Promise<SyncState> {
  const { userId, accountId } = await requireAccount()
  let result: SyncState
  try {
    const synced = await syncThreadsReplies(userId, accountId)
    if (synced === 'cooldown') return { status: 'cooldown', message: 'Balasan Threads baru saja ditarik.' }
    result = {
      status: 'done',
      message:
        synced.failed > 0
          ? `Balasan dari ${synced.posts} post Threads ditarik; ${synced.failed} post gagal dibaca.`
          : `Balasan dari ${synced.posts} post Threads ditarik.`,
    }
  } catch (error) {
    result = {
      status: 'error',
      message:
        error instanceof MissingThreadsRepliesPermissionError
          ? MISSING_PERMISSION
          : await threadsErrorMessage(userId, error, 'balasan Threads gagal ditarik'),
    }
  }
  refresh()
  return result
}

/** Called once a post's replies show. No refresh(): the counts update on the next navigation. */
export async function markThreadsPostSeenAction(mediaId: unknown): Promise<void> {
  const { userId, accountId } = await requireAccount()
  const post = idOf(mediaId)
  if (!post) return
  try {
    await markThreadsPostSeen(userId, accountId, post)
  } catch (error) {
    console.error('[balasan] status balasan Threads dibaca gagal disimpan:', describeError(error))
  }
}

/** A public reply on Threads, under the reply the owner answers. */
export async function replyToThreadsAction(replyId: unknown, reply: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const id = idOf(replyId)
  const message = text(reply)
  if (!message) return 'Tulis balasan dulu.'
  if (threadsLength(message) > THREADS_TEXT_LIMIT) return `Balasan Threads maksimal ${THREADS_TEXT_LIMIT} karakter.`

  let target
  let account
  let sentId: string
  try {
    target = id ? await getThreadsReply(userId, accountId, id) : null
    if (!target) return NOT_FOUND
    account = await getThreadsAccount(userId, accountId)
    const containerId = await createThreadsContainer(account.accessToken, account.threadsUserId, {
      media_type: 'TEXT',
      text: message,
      reply_to_id: target.commentId,
    })
    if (!(await isReady(account.accessToken, containerId))) return 'Threads masih memproses balasan ini. Kirim lagi sebentar.'
    sentId = await publishThreadsContainer(account.accessToken, account.threadsUserId, containerId)
  } catch (error) {
    return threadsErrorMessage(userId, error, 'balasan Threads gagal dikirim')
  }

  // The reply is out. If storing it fails, the next pull brings it in.
  try {
    await recordOwnThreadsReply(userId, accountId, {
      id: sentId,
      mediaId: target.mediaId,
      repliedToId: target.commentId,
      topId: target.parentId ?? target.commentId,
      text: message,
      username: account.username,
    })
  } catch (error) {
    console.error('[balasan] balasan Threads terkirim tapi gagal disimpan:', describeError(error))
  }
  refresh()
  return null
}

/** Hides a top-level reply (with its branch) from everyone but its author, or shows it again. */
export async function setThreadsHiddenAction(replyId: unknown, hidden: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const id = idOf(replyId)
  if (typeof hidden !== 'boolean') return NOT_FOUND
  try {
    const target = id ? await getThreadsReply(userId, accountId, id) : null
    if (!target) return NOT_FOUND
    if (target.isFromOwner) return 'Balasan milikmu sendiri tidak bisa disembunyikan.'
    if (target.parentId) return 'Threads hanya bisa menyembunyikan balasan teratas; balasan di bawahnya ikut tersembunyi.'
    await setThreadsReplyHidden((await getThreadsAccount(userId, accountId)).accessToken, target.commentId, hidden)
    await setThreadsReplyHiddenRow(userId, target.commentId, hidden).catch((error: unknown) =>
      console.error('[balasan] balasan Threads diubah tapi status lokal gagal disimpan:', describeError(error)),
    )
  } catch (error) {
    return threadsErrorMessage(userId, error, 'balasan Threads gagal diubah')
  }
  refresh()
  return null
}

/** ✨ AI under a Threads reply: a draft from its branch and the post, or the owner's text tidied. Sends nothing. */
export async function draftThreadsReply(replyId: unknown, draft: unknown): Promise<DraftResult> {
  const { userId, accountId } = await requireAccount()
  const id = idOf(replyId)
  const ownerDraft = typeof draft === 'string' ? draft.slice(0, THREADS_TEXT_LIMIT) : ''
  try {
    const target = id ? await getThreadsReply(userId, accountId, id) : null
    if (!target) return { error: NOT_FOUND }
    const [branch, posts] = await Promise.all([
      getThreadsBranch(userId, target.parentId ?? target.commentId),
      listThreadsPosts(userId, [target.mediaId]),
    ])
    // The branch up to the reply being answered.
    const lines = branch
      .filter((line) => line.createdAt <= target.createdAt)
      .slice(-REPLY_CONTEXT_MESSAGES)
      .map((line) => ({ fromCustomer: !line.isFromOwner, text: line.text }))
    const reply = await draftReply(userId, {
      channel: 'threads',
      lines,
      draft: ownerDraft,
      caption: posts.get(target.mediaId)?.caption ?? null,
    })
    return { draft: reply }
  } catch (error) {
    console.error('[balasan] draf AI Threads gagal:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}
