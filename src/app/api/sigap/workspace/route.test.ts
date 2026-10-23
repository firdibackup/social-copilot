import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAccount } from '@/lib/auth'
import { getSession, listMessages, listSessions } from '@/lib/chat'
import { GET } from './route'

vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn() }))
vi.mock('@/lib/chat', () => ({ getSession: vi.fn(), listMessages: vi.fn(), listSessions: vi.fn() }))
vi.mock('@/lib/assets', () => ({ listProductGroups: vi.fn() }))
vi.mock('@/lib/density', () => ({ getDensityDefault: vi.fn() }))

const id = '00000000-0000-4000-8000-000000000001'
const request = (query: string) => new Request(`http://localhost/api/sigap/workspace?${query}`)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAccount).mockResolvedValue({ userId: 'u', accountId: 'ig' })
})

describe('Sigap workspace reads', () => {
  it('rejects changed account scope before reading any data', async () => {
    const response = await GET(request(`scope=u:other&part=conversation&id=${id}`))
    expect(response.status).toBe(409)
    expect(getSession).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('validates conversation ids before querying the database', async () => {
    expect((await GET(request('scope=u:ig&part=conversation&id=bad'))).status).toBe(400)
    expect(getSession).not.toHaveBeenCalled()
  })

  it('does not read messages for a session outside the active account', async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    const response = await GET(request(`scope=u:ig&part=conversation&id=${id}`))
    expect(getSession).toHaveBeenCalledWith('u', 'ig', id)
    expect(listMessages).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({ session: null, messages: [] })
  })

  it('reads only the requested owned conversation, not the entire workspace', async () => {
    vi.mocked(getSession).mockResolvedValue({ id, title: 'Chat', summary: '', summarizedCount: 0 })
    vi.mocked(listMessages).mockResolvedValue([])
    const response = await GET(request(`scope=u:ig&part=conversation&id=${id}`))
    expect(await response.json()).toEqual({ session: { id }, messages: [] })
    expect(listMessages).toHaveBeenCalledWith('u', id)
    expect(listSessions).not.toHaveBeenCalled()
  })
})
