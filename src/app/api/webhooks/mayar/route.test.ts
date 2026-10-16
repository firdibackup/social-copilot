import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncPaymentsByMayarIds } from '@/lib/billing'
import { POST } from './route'

vi.mock('@/lib/billing', () => ({ syncPaymentsByMayarIds: vi.fn() }))

const webhook = (body: string) =>
  POST(new Request('https://app.test/api/webhooks/mayar', { method: 'POST', body, headers: { 'content-type': 'application/json' } }))

beforeEach(() => {
  vi.mocked(syncPaymentsByMayarIds).mockReset().mockResolvedValue(0)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/webhooks/mayar', () => {
  it('only hands the ids to the check against Mayar, whatever status the body claims', async () => {
    const response = await webhook(JSON.stringify({ event: 'payment.received', data: { productId: 'pr-1', status: 'paid' } }))

    expect(response.status).toBe(200)
    expect(syncPaymentsByMayarIds).toHaveBeenCalledWith(['pr-1'])
  })

  it('rejects a body that is not JSON', async () => {
    expect((await webhook('not json')).status).toBe(400)
    expect(syncPaymentsByMayarIds).not.toHaveBeenCalled()
  })

  it('answers 500 when the check fails, so Mayar can retry', async () => {
    vi.mocked(syncPaymentsByMayarIds).mockRejectedValue(new Error('Supabase: down'))

    expect((await webhook(JSON.stringify({ data: { productId: 'pr-1' } }))).status).toBe(500)
  })
})
