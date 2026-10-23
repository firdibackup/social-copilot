import { beforeEach, describe, expect, it, vi } from 'vitest'
import { remainingCredits } from '@/lib/ai'
import { contentCost, TASK_CREDITS } from '@/lib/billing-options'
import { getMessage, getSession, updateBulkCard } from '@/lib/chat'
import type { BulkPlanItem, ChatPart } from '@/lib/chat-options'
import { enqueueContentJob, getContentJobByKey, type ContentJob } from '@/lib/content-jobs'
import { deleteAccountIdea, ensureIdea, getAccountIdea } from '@/lib/ideas'
import { cancelBulkAction, startBulkAction } from './actions'

vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: USER, accountId: ACCOUNT })) }))
vi.mock('@/lib/ai', () => ({ remainingCredits: vi.fn(), aiErrorMessage: () => 'AI gagal.' }))
vi.mock('@/lib/app-settings', () => ({ getPlan: vi.fn(async () => ({ credits: 10_000 })) }))
vi.mock('@/lib/density', () => ({ getDensityDefault: vi.fn(async () => 'ringkas') }))
vi.mock('@/lib/chat', () => ({
  getSession: vi.fn(),
  getMessage: vi.fn(),
  deleteSession: vi.fn(),
  discardScript: vi.fn(),
  resolveConfirmation: vi.fn(),
  updateBulkCard: vi.fn(),
}))
vi.mock('@/lib/content-jobs', () => ({ enqueueContentJob: vi.fn(), getContentJobByKey: vi.fn() }))
vi.mock('@/lib/ideas', () => ({ getAccountIdea: vi.fn(), ensureIdea: vi.fn(), deleteAccountIdea: vi.fn() }))
vi.mock('@/lib/posts', () => ({ ContentError: class ContentError extends Error {} }))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))

const USER = 'user-1'
const ACCOUNT = 'ig-1'
const SESSION = '00000000-0000-4000-8000-000000000001'
const MESSAGE = '00000000-0000-4000-8000-000000000002'
const BULK = '00000000-0000-4000-8000-000000000003'
const KEY_A = '11111111-1111-4111-8111-00000000000a'
const KEY_B = '11111111-1111-4111-8111-00000000000b'
const KEY_C = '11111111-1111-4111-8111-00000000000c'
const SAVED = '22222222-2222-4222-8222-000000000001'
const SCRIPT = [
  { label: 'Hook', title: 'Mulai', body: '' },
  { label: 'CTA', title: 'Selesai', body: '' },
]

const item = (key: string, overrides: Partial<BulkPlanItem> = {}): BulkPlanItem => ({
  key, title: `Judul ${key.slice(-1)}`, angle: 'Sudut', pillarId: 'p-promo', ideaId: null, scripted: false, slides: 3, points: ['A', 'B', 'C'], ...overrides,
})
const PLAN = [item(KEY_A), item(KEY_B), item(KEY_C, { ideaId: SAVED, scripted: true, slides: 2, title: 'Tersimpan' })]
const edits = (plan: BulkPlanItem[]) => plan.map(({ key, title, angle }) => ({ key, title, angle }))

function card(overrides: Partial<Extract<ChatPart, { type: 'bulk' }>> = {}) {
  vi.mocked(getMessage).mockResolvedValue({
    id: MESSAGE,
    parts: [{ type: 'bulk', id: BULK, state: 'proposed', plan: PLAN, items: [], errors: [], ...overrides }],
  } as never)
}

describe('startBulkAction', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset().mockResolvedValue({ id: SESSION } as never)
    card()
    vi.mocked(remainingCredits).mockReset().mockResolvedValue({ remaining: 10_000 } as never)
    vi.mocked(updateBulkCard).mockReset().mockResolvedValue('ok')
    vi.mocked(getContentJobByKey).mockReset().mockResolvedValue(null)
    vi.mocked(getAccountIdea).mockReset().mockResolvedValue({ id: SAVED, title: 'Tersimpan', pillarId: null, script: SCRIPT })
    vi.mocked(ensureIdea).mockReset().mockResolvedValue()
    vi.mocked(deleteAccountIdea).mockReset().mockResolvedValue()
    let post = 0
    vi.mocked(enqueueContentJob).mockReset().mockImplementation(async () => `post-${++post}`)
  })

  it('queues every post once approved: new topics write their script and go on to images by themselves', async () => {
    const plan = [{ ...PLAN[0], title: 'Judul baru' }, PLAN[2]]
    expect(await startBulkAction(SESSION, MESSAGE, BULK, edits(plan))).toBeNull()

    expect(updateBulkCard).toHaveBeenNthCalledWith(1, USER, ACCOUNT, MESSAGE, BULK, 'proposed', { state: 'starting', plan })
    expect(ensureIdea).toHaveBeenCalledWith(USER, ACCOUNT, KEY_A, { title: 'Judul baru', pillarId: 'p-promo' })
    expect(enqueueContentJob).toHaveBeenNthCalledWith(1, USER, ACCOUNT, KEY_A, KEY_A, 'script', {
      density: 'ringkas',
      brief: expect.stringContaining('Tulis tepat 3 slide.'),
      auto: { request: expect.objectContaining({ topic: 'Judul baru', slides: 3, ideaId: KEY_A, pillarId: 'p-promo', density: 'ringkas', format: '4:5' }) },
    })
    // A saved script is drawn as it is, with its own slide count.
    expect(enqueueContentJob).toHaveBeenNthCalledWith(2, USER, ACCOUNT, KEY_C, SAVED, 'content', {
      request: expect.objectContaining({ topic: 'Tersimpan', slides: 2, ideaId: SAVED }),
      script: SCRIPT,
      attachmentPath: null,
    })
    expect(updateBulkCard).toHaveBeenLastCalledWith(USER, ACCOUNT, MESSAGE, BULK, 'starting', {
      state: 'started',
      items: [
        { postId: 'post-1', ideaId: KEY_A, title: 'Judul baru' },
        { postId: 'post-2', ideaId: SAVED, title: 'Tersimpan' },
      ],
      errors: [],
    })
  })

  it('refuses a plan the quota cannot cover, before anything is queued', async () => {
    const total = 2 * (TASK_CREDITS.content_script + contentCost(3)) + contentCost(2)
    vi.mocked(remainingCredits).mockResolvedValue({ remaining: total - 1 } as never)

    expect(await startBulkAction(SESSION, MESSAGE, BULK, edits(PLAN))).toMatch(/^Kuota AI tidak cukup/)
    expect(updateBulkCard).not.toHaveBeenCalled()
    expect(enqueueContentJob).not.toHaveBeenCalled()
  })

  it('starts nothing twice: another click already moved the card', async () => {
    vi.mocked(updateBulkCard).mockResolvedValueOnce('already')

    expect(await startBulkAction(SESSION, MESSAGE, BULK, edits(PLAN))).toBeNull()
    expect(enqueueContentJob).not.toHaveBeenCalled()
  })

  it('finishes a card left starting from its saved plan, finding what was already queued', async () => {
    card({ state: 'starting', plan: [PLAN[0], PLAN[1]] })
    vi.mocked(getContentJobByKey).mockImplementation(async (_user, _account, key) =>
      key === KEY_A ? ({ post_id: 'post-a', idea_id: KEY_A } as ContentJob) : null)

    expect(await startBulkAction(SESSION, MESSAGE, BULK, [])).toBeNull()

    expect(remainingCredits).not.toHaveBeenCalled()
    expect(enqueueContentJob).toHaveBeenCalledTimes(1)
    expect(enqueueContentJob).toHaveBeenCalledWith(USER, ACCOUNT, KEY_B, KEY_B, 'script', expect.any(Object))
    expect(updateBulkCard).toHaveBeenLastCalledWith(USER, ACCOUNT, MESSAGE, BULK, 'starting', expect.objectContaining({
      state: 'started',
      items: [expect.objectContaining({ postId: 'post-a' }), expect.objectContaining({ postId: 'post-1' })],
    }))
  })

  it('removes a new idea whose job could not be queued, and keeps the plan when nothing was', async () => {
    vi.mocked(enqueueContentJob).mockRejectedValue(new Error('boom'))

    const error = await startBulkAction(SESSION, MESSAGE, BULK, edits([PLAN[0]]))

    expect(error).toBe('Judul a: Gagal diantrekan. Coba lagi.')
    expect(deleteAccountIdea).toHaveBeenCalledWith(USER, ACCOUNT, KEY_A)
    expect(updateBulkCard).toHaveBeenLastCalledWith(USER, ACCOUNT, MESSAGE, BULK, 'starting', { state: 'proposed', errors: [error] })
  })

  it('rejects edits that are not on the plan, and cards that are not the owner\'s', async () => {
    expect(await startBulkAction(SESSION, MESSAGE, BULK, [{ key: 'other', title: 'x', angle: '' }])).toBe('Rencana tidak valid. Muat ulang halaman.')
    expect(await startBulkAction(SESSION, MESSAGE, 'bukan-uuid', edits(PLAN))).toBe('Pesan tidak ditemukan. Muat ulang halaman.')
    vi.mocked(getSession).mockResolvedValue(null)
    expect(await startBulkAction(SESSION, MESSAGE, BULK, edits(PLAN))).toBe('Pesan tidak ditemukan. Muat ulang halaman.')
    expect(enqueueContentJob).not.toHaveBeenCalled()
  })
})

describe('cancelBulkAction', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset().mockResolvedValue({ id: SESSION } as never)
    vi.mocked(updateBulkCard).mockReset().mockResolvedValue('ok')
  })

  it('cancels a proposed plan only', async () => {
    card()
    expect(await cancelBulkAction(SESSION, MESSAGE, BULK)).toBeNull()
    expect(updateBulkCard).toHaveBeenCalledWith(USER, ACCOUNT, MESSAGE, BULK, 'proposed', { state: 'cancelled' })

    vi.mocked(updateBulkCard).mockClear()
    card({ state: 'started' })
    expect(await cancelBulkAction(SESSION, MESSAGE, BULK)).toBeNull()
    expect(updateBulkCard).not.toHaveBeenCalled()
  })
})
