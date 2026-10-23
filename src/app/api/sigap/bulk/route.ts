import { getPlan } from '@/lib/app-settings'
import { getCurrentPeriod } from '@/lib/billing'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { requireAccount } from '@/lib/auth'
import { getBulkStatuses, MAX_BULK_POLL } from '@/lib/bulk-content'
import type { BulkStatusResponse } from '@/lib/chat-options'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'

/** A bulk card's poll. A GET route, not a server action: actions run one at a time and would queue the card's buttons. */
export async function GET(request: Request) {
  const { userId, accountId } = await requireAccount()
  const ids = [...new Set(new URL(request.url).searchParams.getAll('id'))]
  const headers = { 'cache-control': 'private, no-store' }
  if (ids.length > MAX_BULK_POLL || !ids.every(isUuid)) {
    return Response.json({ error: 'Konten tidak valid.' }, { status: 400, headers })
  }
  try {
    const [items, period, billing] = await Promise.all([getBulkStatuses(userId, accountId, ids), getCurrentPeriod(userId), getBillingCatalog()])
    const plan = period?.plan ?? await getPlan()
    return Response.json({ items, planCredits: plan.credits, rates: billing.catalog.rates } satisfies BulkStatusResponse, { headers })
  } catch (error) {
    console.error('[sigap] status konten massal gagal dimuat:', describeError(error))
    return Response.json({ error: 'Status belum bisa dimuat.' }, { status: 500, headers })
  }
}
