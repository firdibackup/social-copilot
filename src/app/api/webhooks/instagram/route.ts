import { getConnectedAccountId, getValidAccessToken } from '@/lib/connection'
import { needsProfile, recordMessage, saveProfile } from '@/lib/dm'
import { hasValidSignature, parseMessageEvents } from '@/lib/dm-webhook'
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
 * DMs to and from the connected account, through the public tunnel. Answers 200 once they are stored; an error
 * status makes Meta retry, and `mid` keeps the retry from storing a message twice.
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
    const accountId = await getConnectedAccountId()
    for (const event of accountId ? parseMessageEvents(payload, accountId) : []) {
      if ((await recordMessage(event)) && event.fromCustomer) await fillProfile(event.igsid)
    }
  } catch (error) {
    console.error('[balasan] webhook gagal disimpan:', describeError(error))
    return new Response(null, { status: 500 })
  }
  return new Response('EVENT_RECEIVED')
}

/** Best effort: until the profile API answers, the inbox shows the customer without a name. */
async function fillProfile(igsid: string): Promise<void> {
  try {
    if (!(await needsProfile(igsid))) return
    await saveProfile(igsid, await fetchCustomerProfile(await getValidAccessToken(), igsid))
  } catch (error) {
    console.error('[balasan] profil pelanggan gagal diambil:', describeError(error))
  }
}
