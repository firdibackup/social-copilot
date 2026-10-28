'use server'

import { refresh } from 'next/cache'
import { aiErrorMessage } from '@/lib/ai'
import { requireAccount } from '@/lib/auth'
import { MissingCommentsPermissionError, syncComments } from '@/lib/comment-sync'
import {
  deleteCommentRows,
  getComment,
  getCommentThread,
  listCommentPosts,
  markPostCommentsSeen,
  recordOwnReply,
  setCommentHiddenRow,
} from '@/lib/comments'
import { getPublishingAccount } from '@/lib/connection'
import { recordPrivateReply } from '@/lib/dm'
import { REPLY_MAX_LENGTH } from '@/lib/inbox-rules'
import { describeError } from '@/lib/errors'
import { canPrivateReply, COMMENT_MAX_LENGTH } from '@/lib/inbox-rules'
import { deleteComment, replyToComment, sendPrivateReply, setCommentHidden } from '@/lib/instagram'
import { draftReply, REPLY_CONTEXT_MESSAGES, type ReplyChannel } from '@/lib/reply-ai'
import { instagramErrorMessage, text, type ActionError, type DraftResult, type SyncState } from './action-utils'

const NUMERIC_ID = /^\d+$/
const NOT_FOUND = 'Komentar tidak ditemukan.'
const MISSING_PERMISSION = 'Komentar butuh izin baru dari Instagram. Hubungkan ulang Instagram sekali.'
const PRIVATE_REPLY_CLOSED =
  'Komentar ini sudah dibalas lewat DM, atau sudah lewat 7 hari. Instagram hanya menerima satu DM per komentar dalam 7 hari.'

const commentIdOf = (value: unknown) => (typeof value === 'string' && NUMERIC_ID.test(value) ? value : null)

/** Opening the Komentar tab and Muat ulang: pulls comments of the last 30 days' posts, at most every 10 minutes. */
export async function syncCommentsAction(): Promise<SyncState> {
  const { userId, accountId } = await requireAccount()
  let result: SyncState
  try {
    const synced = await syncComments(userId, accountId)
    if (synced === 'cooldown') return { status: 'cooldown', message: 'Komentar baru saja ditarik dari Instagram.' }
    result = {
      status: 'done',
      message:
        synced.failed > 0
          ? `Komentar dari ${synced.posts} post ditarik; ${synced.failed} post gagal dibaca.`
          : `Komentar dari ${synced.posts} post ditarik.`,
    }
  } catch (error) {
    result = {
      status: 'error',
      message:
        error instanceof MissingCommentsPermissionError
          ? MISSING_PERMISSION
          : await instagramErrorMessage(userId, error, 'komentar gagal ditarik'),
    }
  }
  refresh()
  return result
}

/** Called once a post's comments show. No refresh(): the counts update on the next navigation. */
export async function markPostSeenAction(mediaId: unknown): Promise<void> {
  const { userId, accountId } = await requireAccount()
  const post = commentIdOf(mediaId)
  if (!post) return
  try {
    await markPostCommentsSeen(userId, accountId, post)
  } catch (error) {
    console.error('[balasan] status komentar dibaca gagal disimpan:', describeError(error))
  }
}

export async function replyToCommentAction(commentId: unknown, reply: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const id = commentIdOf(commentId)
  const message = text(reply)
  if (!message) return 'Tulis balasan dulu.'
  if (message.length > COMMENT_MAX_LENGTH) return `Balasan komentar maksimal ${COMMENT_MAX_LENGTH} karakter.`

  let comment
  let replyId: string
  // Instagram nests one level: a reply to a reply goes under the top-level comment.
  let parentId: string
  try {
    comment = id ? await getComment(userId, accountId, id) : null
    if (!comment) return NOT_FOUND
    parentId = comment.parentId ?? comment.commentId
    replyId = await replyToComment((await getPublishingAccount(userId)).accessToken, parentId, message)
  } catch (error) {
    return instagramErrorMessage(userId, error, 'balasan komentar gagal dikirim')
  }

  // The reply is out. If storing it fails, the next pull or the webhook brings it in.
  try {
    await recordOwnReply(userId, accountId, { id: replyId, mediaId: comment.mediaId, parentId, text: message })
  } catch (error) {
    console.error('[balasan] balasan komentar terkirim tapi gagal disimpan:', describeError(error))
  }
  refresh()
  return null
}

export async function setCommentHiddenAction(commentId: unknown, hidden: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const id = commentIdOf(commentId)
  if (typeof hidden !== 'boolean') return NOT_FOUND
  try {
    const comment = id ? await getComment(userId, accountId, id) : null
    if (!comment) return NOT_FOUND
    if (comment.isFromOwner) return 'Komentar milikmu sendiri tidak bisa disembunyikan.'
    await setCommentHidden((await getPublishingAccount(userId)).accessToken, comment.commentId, hidden)
    await setCommentHiddenRow(userId, comment.commentId, hidden)
  } catch (error) {
    return instagramErrorMessage(userId, error, 'komentar gagal diubah')
  }
  refresh()
  return null
}

export async function deleteCommentAction(commentId: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const id = commentIdOf(commentId)
  try {
    const comment = id ? await getComment(userId, accountId, id) : null
    if (!comment) return NOT_FOUND
    await deleteComment((await getPublishingAccount(userId)).accessToken, comment.commentId)
    await deleteCommentRows(userId, comment.commentId)
  } catch (error) {
    return instagramErrorMessage(userId, error, 'komentar gagal dihapus')
  }
  refresh()
  return null
}

/** Balas lewat DM: Instagram's private reply, once per comment and within 7 days of it. */
export async function privateReplyAction(commentId: unknown, reply: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const id = commentIdOf(commentId)
  const message = text(reply)
  if (!message) return 'Tulis DM dulu.'
  if (message.length > REPLY_MAX_LENGTH) return `DM maksimal ${REPLY_MAX_LENGTH} karakter.`

  let comment
  let sent
  try {
    comment = id ? await getComment(userId, accountId, id) : null
    if (!comment) return NOT_FOUND
    if (!canPrivateReply(comment, new Date())) return PRIVATE_REPLY_CLOSED
    const account = await getPublishingAccount(userId)
    sent = await sendPrivateReply(account.accessToken, account.instagramUserId, comment.commentId, message)
  } catch (error) {
    return instagramErrorMessage(userId, error, 'DM ke komentar gagal dikirim')
  }

  try {
    await recordPrivateReply(userId, comment, sent, message)
  } catch (error) {
    console.error('[balasan] DM ke komentar terkirim tapi gagal disimpan:', describeError(error))
  }
  refresh()
  return null
}

/** ✨ AI under a comment: a public reply (`comment`) or a private one (`comment_dm`). Sends nothing. */
export async function draftCommentReply(commentId: unknown, channel: unknown, draft: unknown): Promise<DraftResult> {
  const { userId, accountId } = await requireAccount()
  const id = commentIdOf(commentId)
  const kind: ReplyChannel | null = channel === 'comment' || channel === 'comment_dm' ? channel : null
  if (!kind) return { error: NOT_FOUND }
  const ownerDraft = typeof draft === 'string' ? draft.slice(0, COMMENT_MAX_LENGTH) : ''
  try {
    const comment = id ? await getComment(userId, accountId, id) : null
    if (!comment) return { error: NOT_FOUND }
    const [thread, posts] = await Promise.all([
      getCommentThread(userId, comment.parentId ?? comment.commentId),
      listCommentPosts(userId, [comment.mediaId]),
    ])
    // The thread up to the comment being answered: later replies aren't what the owner replies to.
    const lines = thread
      .filter((line) => line.createdAt <= comment.createdAt)
      .slice(-REPLY_CONTEXT_MESSAGES)
      .map((line) => ({ fromCustomer: !line.isFromOwner, text: line.text }))
    const reply = await draftReply(userId, {
      channel: kind,
      lines,
      draft: ownerDraft,
      caption: posts.get(comment.mediaId)?.caption ?? null,
    })
    return { draft: reply }
  } catch (error) {
    console.error('[balasan] draf AI komentar gagal:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}
