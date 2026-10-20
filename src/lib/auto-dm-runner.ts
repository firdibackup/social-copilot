import 'server-only'
import { claimRun, listRules, updateConversationRun, updateRun, type RunUpdate } from './auto-dm'
import { dmAfterTap, firstDm, pickRule, pickVariation, ruleIdFromPayload, type AutoDmRule } from './auto-dm-rules'
import { recordOwnReply, type CommentInput } from './comments'
import { getPublishingAccount, markNeedsReconnect, NeedsReconnectError, type PublishingAccount } from './connection'
import { getConversation, recordMessage, recordPrivateReply } from './dm'
import type { MessageEvent, PostbackEvent } from './dm-webhook'
import { describeError } from './errors'
import { fetchFollowsBusiness, InstagramApiError, replyToComment, sendAutoDm } from './instagram'

/** What one webhook brought that an Auto DM rule may answer: only what was stored for the first time. */
export type AutoDmTrigger =
  | { kind: 'comment'; comment: CommentInput }
  | { kind: 'dm'; message: MessageEvent }
  | { kind: 'postback'; postback: PostbackEvent }

const RECONNECT = 'Token Instagram kedaluwarsa atau dicabut. Hubungkan ulang di Pengaturan.'

/** What the rule card shows for a failed step; the log gets the detail. */
async function failureText(userId: string, error: unknown): Promise<string> {
  console.error('[auto-dm] langkah gagal:', describeError(error))
  if (error instanceof NeedsReconnectError) return RECONNECT
  if (error instanceof InstagramApiError) {
    if (!error.isInvalidToken) return `Instagram menolak: ${error.message}`
    await markNeedsReconnect(userId).catch(() => {})
    return RECONNECT
  }
  return 'Instagram atau database tidak bisa dihubungi.'
}

/** The DM is out: a failed write only loses it from the inbox until the webhook echo or a pull brings it. */
async function keep(write: () => Promise<unknown>): Promise<void> {
  try {
    await write()
  } catch (error) {
    console.error('[auto-dm] DM terkirim tapi gagal disimpan:', describeError(error))
  }
}

/** Runs one claimed trigger; whatever happens ends on its run. */
async function runStep(userId: string, runId: string, step: (account: PublishingAccount) => Promise<RunUpdate>) {
  let update: RunUpdate
  try {
    update = await step(await getPublishingAccount(userId))
  } catch (error) {
    update = { step: 'failed', error: await failureText(userId, error) }
  }
  await updateRun(userId, runId, update)
}

/** A public reply under the comment's thread. Returns why it failed, without stopping the DM. */
async function replyPublicly(
  userId: string,
  accountId: string,
  account: PublishingAccount,
  rule: AutoDmRule,
  comment: CommentInput,
): Promise<string | null> {
  const text = pickVariation(rule.publicReplies)
  const parentId = comment.parentId ?? comment.id
  let replyId: string
  try {
    replyId = await replyToComment(account.accessToken, parentId, text)
  } catch (error) {
    return `Balasan komentar gagal. ${await failureText(userId, error)}`
  }
  await keep(() => recordOwnReply(userId, accountId, { id: replyId, mediaId: comment.mediaId, parentId, text }))
  return null
}

async function onComment(userId: string, accountId: string, rules: AutoDmRule[], comment: CommentInput): Promise<void> {
  if (comment.isFromOwner) return
  const rule = pickRule(rules, { source: 'comment', mediaId: comment.mediaId, text: comment.text })
  if (!rule) return
  const runId = await claimRun(userId, rule.id, {
    source: 'comment',
    triggerId: comment.id,
    personId: comment.fromId,
    username: comment.username,
    text: comment.text,
  })
  if (!runId) return

  await runStep(userId, runId, async (account) => {
    const replyError = rule.publicReply ? await replyPublicly(userId, accountId, account, rule, comment) : null
    const planned = firstDm(rule)
    const sent = await sendAutoDm(account.accessToken, account.instagramUserId, { comment_id: comment.id }, planned.message)
    await keep(() => recordPrivateReply(userId, { commentId: comment.id, username: comment.username }, sent, planned.message.text))
    return { step: planned.step, error: replyError, igsid: sent.recipientId }
  })
}

const recordSent = (userId: string, igsid: string, messageId: string, text: string) =>
  keep(() => recordMessage(userId, { mid: messageId, igsid, fromCustomer: false, text, sentAt: new Date() }))

async function onDm(userId: string, accountId: string, rules: AutoDmRule[], message: MessageEvent): Promise<void> {
  if (!message.fromCustomer || !message.text) return
  const rule = pickRule(rules, { source: 'dm', mediaId: null, text: message.text })
  if (!rule) return
  const conversation = await getConversation(userId, accountId, message.igsid)
  const runId = await claimRun(userId, rule.id, {
    source: 'dm',
    triggerId: message.mid,
    personId: message.igsid,
    username: conversation?.username ?? null,
    text: message.text,
  })
  if (!runId) return

  await runStep(userId, runId, async (account) => {
    const planned = firstDm(rule)
    const sent = await sendAutoDm(account.accessToken, account.instagramUserId, { id: message.igsid }, planned.message)
    await recordSent(userId, message.igsid, sent.messageId, planned.message.text)
    return { step: planned.step, error: null, igsid: message.igsid }
  })
}

/** A tap on the opener or "Sudah follow". A paused or deleted rule leaves it unanswered. */
async function onPostback(userId: string, rules: AutoDmRule[], postback: PostbackEvent): Promise<void> {
  const ruleId = ruleIdFromPayload(postback.payload)
  const rule = ruleId ? rules.find((candidate) => candidate.id === ruleId) : undefined
  if (!rule) return

  let update: RunUpdate
  try {
    const account = await getPublishingAccount(userId)
    const follows = rule.followGate ? await fetchFollowsBusiness(account.accessToken, postback.igsid) : true
    const planned = dmAfterTap(rule, follows)
    const sent = await sendAutoDm(account.accessToken, account.instagramUserId, { id: postback.igsid }, planned.message)
    await recordSent(userId, postback.igsid, sent.messageId, planned.message.text)
    update = { step: planned.step, error: null }
  } catch (error) {
    update = { step: 'failed', error: await failureText(userId, error) }
  }
  await updateConversationRun(userId, rule.id, postback.igsid, update)
}

function answer(userId: string, accountId: string, rules: AutoDmRule[], trigger: AutoDmTrigger): Promise<void> {
  if (trigger.kind === 'comment') return onComment(userId, accountId, rules, trigger.comment)
  if (trigger.kind === 'dm') return onDm(userId, accountId, rules, trigger.message)
  return onPostback(userId, rules, trigger.postback)
}

/**
 * Answers what one webhook brought with the account's active rules, in order. Runs after the webhook has answered
 * Meta, so it never throws: a failed step lands on its run, anything else in the log.
 */
export async function runAutoDm(userId: string, accountId: string, triggers: readonly AutoDmTrigger[]): Promise<void> {
  let rules: AutoDmRule[]
  try {
    rules = await listRules(userId, accountId, true)
  } catch (error) {
    console.error('[auto-dm] aturan gagal dimuat:', describeError(error))
    return
  }
  if (rules.length === 0) return
  for (const trigger of triggers) {
    try {
      await answer(userId, accountId, rules, trigger)
    } catch (error) {
      console.error('[auto-dm] pemicu gagal diproses:', describeError(error))
    }
  }
}
