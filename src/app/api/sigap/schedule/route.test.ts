import { beforeEach, expect, it, vi } from 'vitest'
import { getMessage, getSession } from '@/lib/chat'
import { loadScheduleData } from '@/lib/chat-schedule'
import { GET } from './route'

vi.mock('@/lib/auth', () => ({ requireAccount: async () => ({ userId: 'owner', accountId: 'account' }) }))
vi.mock('@/lib/chat', () => ({ getMessage: vi.fn(), getSession: vi.fn() }))
vi.mock('@/lib/chat-schedule', () => ({ loadScheduleData: vi.fn() }))

const SESSION = '00000000-0000-4000-8000-000000000001'
const MESSAGE = '00000000-0000-4000-8000-000000000002'
const CARD = '00000000-0000-4000-8000-000000000003'
const request = () => new Request(`http://localhost/api/sigap/schedule?session=${SESSION}&message=${MESSAGE}&card=${CARD}`)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockResolvedValue({ id: SESSION } as never)
  vi.mocked(getMessage).mockResolvedValue({ parts: [{ type: 'schedule', id: CARD, items: [{ kind: 'idea', id: 'idea', title: 'Kopi' }] }] } as never)
  vi.mocked(loadScheduleData).mockResolvedValue({ items: [], slots: [], planCredits: 10000 })
})

it('reloads stored references with live status rather than persisting transient readiness', async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(loadScheduleData).toHaveBeenCalledWith('owner', 'account', [{ kind: 'idea', id: 'idea', title: 'Kopi' }], undefined)
})

it('rejects another account session before loading content', async () => {
  vi.mocked(getSession).mockResolvedValue(null)
  expect((await GET(request())).status).toBe(404)
  expect(getMessage).not.toHaveBeenCalled()
  expect(loadScheduleData).not.toHaveBeenCalled()
})

it('rejects malformed identifiers and unknown cards', async () => {
  expect((await GET(new Request('http://localhost/api/sigap/schedule?session=no'))).status).toBe(400)
  vi.mocked(getMessage).mockResolvedValue({ parts: [] } as never)
  expect((await GET(request())).status).toBe(404)
  expect(loadScheduleData).not.toHaveBeenCalled()
})

it('supports existing started bulk cards', async () => {
  vi.mocked(getMessage).mockResolvedValue({ parts: [{ type: 'bulk', id: CARD, state: 'started', items: [{ postId: 'post', title: 'Kopi' }] }] } as never)
  expect((await GET(request())).status).toBe(200)
  expect(loadScheduleData).toHaveBeenCalledWith('owner', 'account', [{ kind: 'post', id: 'post', title: 'Kopi' }], undefined)
})
