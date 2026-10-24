import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncPaymentsByMayarIds } from '@/lib/billing'
import { POST } from './route'

vi.mock('@/lib/billing', () => ({ syncPaymentsByMayarIds: vi.fn() }))

const webhook = (body: string, query = '') =>
  POST(new Request(`https://app.test/api/webhooks/mayar${query}`, { method: 'POST', body, headers: { 'content-type': 'application/json' } }))

beforeEach(() => {
  vi.mocked(syncPaymentsByMayarIds).mockReset().mockResolvedValue(0)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/webhooks/mayar', () => {
  it('rejects a call without the right token once MAYAR_WEBHOOK_TOKEN is set', async () => {
    vi.stubEnv('MAYAR_WEBHOOK_TOKEN', 'rahasia')
    const body = JSON.stringify({ data: { productId: 'pr-1' } })

    expect((await webhook(body)).status).toBe(401)
    expect((await webhook(body, '?token=salah')).status).toBe(401)
    expect(syncPaymentsByMayarIds).not.toHaveBeenCalled()
    expect((await webhook(body, '?token=rahasia')).status).toBe(200)
    expect(syncPaymentsByMayarIds).toHaveBeenCalledWith(['pr-1'])
  })

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
