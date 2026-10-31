import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'
import { requireAccount } from '@/lib/auth'
import { loadEditorDetail, loadEditorSupport } from '@/lib/editor-data'

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const { createTranslator } = await import('next-intl')
    const { default: editor } = await import('../../../../../messages/id/editor.json')
    return createTranslator({ locale: 'id', messages: { editor }, namespace: namespace as 'editor.routeeditor' })
  },
}))
vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn() }))
vi.mock('@/lib/editor-data', () => ({ loadEditorDetail: vi.fn(), loadEditorSupport: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAccount).mockResolvedValue({ userId: 'user', accountId: 'account' })
})

describe('editor API scope', () => {
  it('rejects an old account scope before loading any data', async () => {
    const response = await GET(new Request('https://app.test/api/content/editor?scope=user:other'))
    expect(response.status).toBe(409)
    expect(loadEditorDetail).not.toHaveBeenCalled()
    expect(loadEditorSupport).not.toHaveBeenCalled()
  })
  it('rejects malformed draft IDs', async () => {
    const response = await GET(new Request('https://app.test/api/content/editor?scope=user:account&id=bad'))
    expect(response.status).toBe(400)
    expect(loadEditorDetail).not.toHaveBeenCalled()
  })
  it('loads support independently with private no-store HTTP caching', async () => {
    vi.mocked(loadEditorSupport).mockResolvedValue({ credits: 10 } as never)
    const response = await GET(new Request('https://app.test/api/content/editor?scope=user:account&part=support'))
    expect(await response.json()).toEqual({ credits: 10 })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('server-timing')).toContain('editor;dur=')
    expect(loadEditorDetail).not.toHaveBeenCalled()
  })
})
