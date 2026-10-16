import { syncPaymentsByMayarIds } from '@/lib/billing'
import { describeError } from '@/lib/errors'
import { webhookPaymentIds } from '@/lib/mayar'

/**
 * Mayar's notice that something was paid. The body is only a hint (Mayar signs nothing): the payments it names
 * are confirmed with Mayar's API before a period starts. An error status lets Mayar retry.
 */
export async function POST(request: Request): Promise<Response> {
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
