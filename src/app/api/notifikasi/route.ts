import { getLocale } from 'next-intl/server'
import { after } from 'next/server'
import { currentUser } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { ensureWebhookSubscription } from '@/lib/inbox-sync'
import type { NotificationFeed } from '@/lib/inbox-rules'
import { getNotificationFeed } from '@/lib/notifications'

const NO_STORE = { 'cache-control': 'no-store' }
const OFF: NotificationFeed = { status: 'active', count: 0, items: [] }

/**
 * The bell polls this every 10 seconds and when its tab is shown again. A route rather than a server action: actions
 * run one at a time per page, so a poll would wait behind a slow ✨ AI request, and a poll would hold up the owner's
 * own actions.
 */
export async function GET(): Promise<Response> {
  const user = await currentUser()
  if (!user) return new Response(null, { status: 401 })
  after(() => ensureWebhookSubscription(user.id))
  try {
    return Response.json(await getNotificationFeed(user.id, await getLocale()), { headers: NO_STORE })
  } catch (error) {
    console.error('[notifikasi] gagal dimuat:', describeError(error))
    return Response.json(OFF, { status: 500, headers: NO_STORE })
  }
}
