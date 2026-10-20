import { after } from 'next/server'
import { runAutoDm, type AutoDmTrigger } from '@/lib/auto-dm-runner'
import { getCurrentPeriod } from '@/lib/billing'
import { markReplies, saveComments, type CommentInput } from '@/lib/comments'
import { findUserByInstagramId, getConnection, getValidAccessToken } from '@/lib/connection'
import { needsProfile, recordMessage, saveProfile } from '@/lib/dm'
import {
  entryAccountIds,
  hasValidSignature,
  parseCommentEvents,
  parseMessageEvents,
  parsePostbackEvents,
} from '@/lib/dm-webhook'
import { env } from '@/lib/env'
import { describeError } from '@/lib/errors'
import { isOwnComment } from '@/lib/inbox-rules'
import { fetchCustomerProfile } from '@/lib/instagram'

/** Meta's check when the callback URL is saved in the app dashboard: echo the challenge for our verify token. */
export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams
  const verified =
    params.get('hub.mode') === 'subscribe' && params.get('hub.verify_token') === env('INSTAGRAM_WEBHOOK_VERIFY_TOKEN')
  return verified ? new Response(params.get('hub.challenge') ?? '') : new Response(null, { status: 403 })
}

/**
 * DMs to and from every connected account, Auto DM button taps, and comments on its posts. Each entry goes to the
 * user who connected its account; accounts no user has, and users without an active subscription, are skipped.
 * Answers 200 once they are stored; an error status makes Meta retry, and `mid` or the comment id keeps the retry
 * from storing twice. Auto DM rules answer afterwards, so Meta isn't kept waiting on Instagram calls.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = Buffer.from(await request.arrayBuffer())
  if (!hasValidSignature(rawBody, request.headers.get('x-hub-signature-256'), env('INSTAGRAM_APP_SECRET'))) {
    return new Response(null, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return new Response(null, { status: 400 })
  }

  try {
    for (const accountId of entryAccountIds(payload)) {
      const userId = await findUserByInstagramId(accountId)
      if (!userId || !(await getCurrentPeriod(userId))) continue
      const triggers: AutoDmTrigger[] = []
      for (const event of parseMessageEvents(payload, accountId)) {
        if (!(await recordMessage(userId, event)) || !event.fromCustomer) continue
        await fillProfile(userId, event.igsid)
        triggers.push({ kind: 'dm', message: event })
      }
      for (const postback of parsePostbackEvents(payload, accountId)) {
        // The tapped button reads as the customer's message, which also opens the 24-hour reply window.
        const { mid, igsid, title, sentAt } = postback
        const event = { mid, igsid, fromCustomer: true, text: title || null, sentAt }
        if (!(await recordMessage(userId, event))) continue
        await fillProfile(userId, postback.igsid)
        triggers.push({ kind: 'postback', postback })
      }
      for (const comment of await storeComments(userId, accountId, payload)) triggers.push({ kind: 'comment', comment })
      if (triggers.length > 0) after(() => runAutoDm(userId, accountId, triggers))
    }
  } catch (error) {
    console.error('[balasan] webhook gagal disimpan:', describeError(error))
    return new Response(null, { status: 500 })
  }
  return new Response('EVENT_RECEIVED')
}

/** Returns the stored comments; a retry's comments come back too, and Auto DM's claim skips them. */
async function storeComments(userId: string, accountId: string, payload: unknown): Promise<CommentInput[]> {
  const parsed = parseCommentEvents(payload, accountId)
  if (parsed.length === 0) return []
  const ownerUsername = (await getConnection(userId))?.username ?? null
  const comments = parsed.map((comment) => ({ ...comment, isFromOwner: isOwnComment(comment, accountId, ownerUsername) }))
  await saveComments(userId, accountId, comments, 'insert')
  await markReplies(
    userId,
    comments.map((comment) => comment.mediaId),
  )
  return comments
}

/** Best effort: until the profile API answers, the inbox shows the customer without a name. */
async function fillProfile(userId: string, igsid: string): Promise<void> {
  try {
    if (!(await needsProfile(userId, igsid))) return
    await saveProfile(userId, igsid, await fetchCustomerProfile(await getValidAccessToken(userId), igsid))
  } catch (error) {
    console.error('[balasan] profil pelanggan gagal diambil:', describeError(error))
  }
}
