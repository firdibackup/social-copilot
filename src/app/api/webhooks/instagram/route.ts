import { findUserByInstagramId, getValidAccessToken } from '@/lib/connection'
import { needsProfile, recordMessage, saveProfile } from '@/lib/dm'
import { entryAccountIds, hasValidSignature, parseMessageEvents } from '@/lib/dm-webhook'
import { env } from '@/lib/env'
import { describeError } from '@/lib/errors'
import { fetchCustomerProfile } from '@/lib/instagram'

/** Meta's check when the callback URL is saved in the app dashboard: echo the challenge for our verify token. */
export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams
  const verified =
    params.get('hub.mode') === 'subscribe' && params.get('hub.verify_token') === env('INSTAGRAM_WEBHOOK_VERIFY_TOKEN')
  return verified ? new Response(params.get('hub.challenge') ?? '') : new Response(null, { status: 403 })
}

/**
 * DMs to and from every connected account. Each entry goes to the user who connected its account, and accounts
 * no user has are skipped. Answers 200 once they are stored; an error status makes Meta retry, and `mid` keeps
 * the retry from storing a message twice.
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
      if (!userId) continue
      for (const event of parseMessageEvents(payload, accountId)) {
        if ((await recordMessage(userId, event)) && event.fromCustomer) await fillProfile(userId, event.igsid)
      }
    }
  } catch (error) {
    console.error('[balasan] webhook gagal disimpan:', describeError(error))
    return new Response(null, { status: 500 })
  }
  return new Response('EVENT_RECEIVED')
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
