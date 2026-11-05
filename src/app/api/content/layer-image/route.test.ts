import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'
import { requireAccount } from '@/lib/auth'
import { downloadMedia } from '@/lib/assets'
import { db } from '@/lib/supabase'
import { filtered, queryMock } from '@/test/query-mock'

vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn() }))
vi.mock('@/lib/assets', () => ({ downloadMedia: vi.fn() }))
vi.mock('@/lib/supabase', async (original) => ({ ...(await original<typeof import('@/lib/supabase')>()), db: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
const request = (query = `id=${id}`) => new Request(`https://app.test/api/content/layer-image?${query}`)
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function answer(data: unknown) {
  const mock = queryMock({ data, error: null })
  vi.mocked(db).mockReturnValue(mock.query as never)
  return mock.calls
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAccount).mockResolvedValue({ userId: 'u', accountId: 'a' })
})

describe('layer images', () => {
  it('rejects a bad id before reading anything', async () => {
    expect((await GET(request('id=../x'))).status).toBe(400)
    expect(db).not.toHaveBeenCalled()
  })

  it('checks user/account ownership before downloading', async () => {
    const calls = answer(null)
    expect((await GET(request())).status).toBe(404)
    expect(filtered(calls, 'id', id)).toBe(true)
    expect(filtered(calls, 'user_id', 'u')).toBe(true)
    expect(filtered(calls, 'account_id', 'a')).toBe(true)
    expect(downloadMedia).not.toHaveBeenCalled()
  })

  it('returns the stored bytes as they are, typed by their content, with private caching', async () => {
    answer({ storage_path: 'u/layers/x.png' })
    vi.mocked(downloadMedia).mockResolvedValue(PNG)
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('private, max-age=300')
    expect(response.headers.get('vary')).toBe('Cookie')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
  })

  it('refuses anything that is not a JPEG or PNG', async () => {
    answer({ storage_path: 'u/x.jpg' })
    vi.mocked(downloadMedia).mockResolvedValue(new TextEncoder().encode('<svg onload=alert(1)>'))
    expect((await GET(request())).status).toBe(415)
  })
})
