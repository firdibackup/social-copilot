import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { GET } from './route'
import { requireAccount } from '@/lib/auth'
import { downloadMedia } from '@/lib/assets'
import { db } from '@/lib/supabase'
import { filtered, queryMock } from '@/test/query-mock'

vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn() }))
vi.mock('@/lib/assets', () => ({ downloadMedia: vi.fn() }))
vi.mock('@/lib/supabase', async (original) => ({ ...(await original<typeof import('@/lib/supabase')>()), db: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
const request = (suffix = '') => new Request(`https://app.test/api/content/thumbnail?id=${id}&w=96&scope=u:a${suffix}`)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAccount).mockResolvedValue({ userId: 'u', accountId: 'a' })
})

describe('private thumbnails', () => {
  it('rejects mismatched scope and arbitrary transform sizes before reading storage', async () => {
    expect((await GET(new Request(`https://app.test/api/content/thumbnail?id=${id}&w=1024&scope=u:a`))).status).toBe(400)
    expect((await GET(new Request(`https://app.test/api/content/thumbnail?id=${id}&w=96&scope=u:b`))).status).toBe(400)
    expect(db).not.toHaveBeenCalled()
    expect(downloadMedia).not.toHaveBeenCalled()
  })

  it('checks user/account ownership before downloading the image', async () => {
    const { query, calls } = queryMock({ data: null, error: null })
    vi.mocked(db).mockReturnValue(query as never)
    expect((await GET(request())).status).toBe(404)
    expect(filtered(calls, 'user_id', 'u')).toBe(true)
    expect(filtered(calls, 'account_id', 'a')).toBe(true)
    expect(downloadMedia).not.toHaveBeenCalled()
  })

  it('returns a bounded WebP with private browser caching', async () => {
    const { query } = queryMock({ data: { storage_path: 'u/photo.png' }, error: null })
    vi.mocked(db).mockReturnValue(query as never)
    vi.mocked(downloadMedia).mockResolvedValue(await sharp({ create: { width: 480, height: 600, channels: 3, background: '#abcdef' } }).png().toBuffer())
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, max-age=300')
    expect(response.headers.get('vary')).toBe('Cookie')
    const image = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    expect(image.format).toBe('webp')
    expect(image.width).toBeLessThanOrEqual(96)
    expect(image.height).toBeLessThanOrEqual(96)
  })
})
