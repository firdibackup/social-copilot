import { createHash, timingSafeEqual } from 'node:crypto'
import { syncPaymentsByMayarIds } from '@/lib/billing'
import { describeError } from '@/lib/errors'
import { webhookPaymentIds } from '@/lib/mayar'

const digest = (value: string) => createHash('sha256').update(value).digest()

/** Mayar signs nothing, so the registered URL carries `?token=`. Without MAYAR_WEBHOOK_TOKEN every call is accepted. */
function authorized(request: Request): boolean {
  const expected = process.env.MAYAR_WEBHOOK_TOKEN?.trim()
  if (!expected) return true
  const given = new URL(request.url).searchParams.get('token') ?? ''
  return timingSafeEqual(digest(given), digest(expected))
}

/**
 * Mayar's notice that something was paid. The body is only a hint: the payments it names are confirmed with Mayar's
 * API before a period starts. An error status lets Mayar retry.
 */
export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return new Response(null, { status: 401 })

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return new Response(null, { status: 400 })
  }

  try {
    await syncPaymentsByMayarIds(webhookPaymentIds(payload))
  } catch (error) {
    console.error('[langganan] webhook Mayar gagal diproses:', describeError(error))
    return new Response(null, { status: 500 })
  }
  return new Response('OK')
}
