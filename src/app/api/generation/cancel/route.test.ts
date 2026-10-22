import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAccount } from '@/lib/auth'
import { db } from '@/lib/supabase'
import { POST } from './route'

vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn() }))
vi.mock('@/lib/supabase', async original => ({ ...(await original<typeof import('@/lib/supabase')>()), db: vi.fn() }))
const rpc = vi.fn()
const postId = '00000000-0000-4000-8000-000000000001'
const id = '00000000-0000-4000-8000-000000000002'
const request = (input: unknown, origin = 'https://app.example') => new Request('https://app.example/api/generation/cancel', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input),
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireAccount).mockResolvedValue({ userId: 'owner', accountId: 'instagram' })
  vi.mocked(db).mockReturnValue({ rpc } as never)
  rpc.mockResolvedValue({ data: true, error: null })
})

describe('cancel generation endpoint', () => {
  it('rejects cross-origin cancellation before accessing the account', async () => {
    expect((await POST(request({ postId, target: 'content' }, 'https://other.example'))).status).toBe(403)
    expect(requireAccount).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('pins ownership to the authenticated user and connected account', async () => {
    const response = await POST(request({ postId, target: 'slide', id, userId: 'other', accountId: 'other' }))
    expect(await response.json()).toEqual({ cancelled: true })
    expect(rpc).toHaveBeenCalledWith('cancel_generation', {
      p_user_id: 'owner', p_account_id: 'instagram', p_post_id: postId, p_target: 'slide', p_id: id,
    })
  })

  it('rejects malformed ids and unsupported targets', async () => {
    for (const input of [{ postId, target: 'edit' }, { postId: 'invalid', target: 'content' }, { postId, target: 'everything' }]) {
      expect((await POST(request(input))).status).toBe(400)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports a completed or unavailable operation without claiming cancellation', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await (await POST(request({ postId, target: 'images' }))).json()).toEqual({ cancelled: false })
  })
})
