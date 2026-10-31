import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'
import { requireAccount } from '@/lib/auth'
import { listReferences } from '@/lib/brand'

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const { createTranslator } = await import('next-intl')
    const { default: editor } = await import('../../../../../messages/id/editor.json')
    return createTranslator({ locale: 'id', messages: { editor }, namespace: namespace as 'editor.routereferences' })
  },
}))
vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn() }))
vi.mock('@/lib/brand', () => ({ listReferences: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAccount).mockResolvedValue({ userId: 'u', accountId: 'a' })
})

describe('reference picker data', () => {
  it('lists the connected account\'s references for the signed-in user, never cached by the browser', async () => {
    const images = [{ id: 'i1', url: 'https://storage.test/signed', position: 0, label: 'cover' }]
    vi.mocked(listReferences).mockResolvedValue([{ id: 'r1', images }] as never)
    const response = await GET()
    expect(listReferences).toHaveBeenCalledWith('u', 'a')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual([{ id: 'r1', images }])
  })

  it('answers 500 with an Indonesian message when the references cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(listReferences).mockRejectedValue(new Error('Supabase Storage: down'))
    const response = await GET()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Referensi belum bisa dimuat. Coba lagi.' })
  })
})
