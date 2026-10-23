import { beforeEach, describe, expect, it, vi } from 'vitest'
import { remainingCredits } from '@/lib/ai'
import { DEFAULT_CATALOG } from '@/lib/billing-catalog-options'
vi.mock('@/lib/billing-catalog', () => ({ getBillingCatalog: vi.fn(async () => ({ version: 1, catalog: DEFAULT_CATALOG })) }))
import { getMessage, getSession } from '@/lib/chat'
import { commitSigapSchedule, readScheduleItem, scheduleIdeaJob } from '@/lib/chat-schedule'
import { enqueueContentJob, getContentJob } from '@/lib/content-jobs'
import { getAccountIdea } from '@/lib/ideas'
import { listTakenTimes } from '@/lib/schedule'
import { makeScheduleImagesAction, scheduleFromSigapAction } from './schedule-actions'

vi.mock('@/lib/auth', () => ({ requireAccount: async () => ({ userId: 'owner', accountId: 'account' }) }))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/lib/ai', () => ({ remainingCredits: vi.fn(), aiErrorMessage: () => 'AI gagal.' }))
vi.mock('@/lib/chat', () => ({ getMessage: vi.fn(), getSession: vi.fn() }))
vi.mock('@/lib/chat-schedule', () => ({ commitSigapSchedule: vi.fn(), readScheduleItem: vi.fn(), scheduleIdeaJob: vi.fn() }))
vi.mock('@/lib/content-jobs', () => ({ enqueueContentJob: vi.fn(), getContentJob: vi.fn() }))
vi.mock('@/lib/density', () => ({ getDensityDefault: async () => 'ringkas' }))
vi.mock('@/lib/ideas', () => ({ getAccountIdea: vi.fn() }))
vi.mock('@/lib/schedule', () => ({ listTakenTimes: vi.fn() }))

const SESSION = '00000000-0000-4000-8000-000000000001'
const MESSAGE = '00000000-0000-4000-8000-000000000002'
const CARD = '00000000-0000-4000-8000-000000000003'
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const IDEA = '00000000-0000-4000-8000-00000000000c'
const AT = '2099-10-25T19:00'
const SCRIPT = [{ label: 'Hook', title: 'Mulai', body: '' }, { label: 'CTA', title: 'Ayo', body: '' }]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockResolvedValue({ id: SESSION } as never)
  vi.mocked(getMessage).mockResolvedValue({ parts: [{ type: 'schedule', id: CARD, items: [
    { kind: 'post', id: A, title: 'A' }, { kind: 'post', id: B, title: 'B' }, { kind: 'idea', id: IDEA, title: 'Skrip' },
  ] }] } as never)
  vi.mocked(scheduleIdeaJob).mockResolvedValue(null)
  vi.mocked(readScheduleItem).mockImplementation(async (_user, _account, ref) => ({
    ...ref, postId: ref.id, stage: 'ready', reason: 'Siap', scheduledAt: null, imageCost: null,
  }))
  vi.mocked(listTakenTimes).mockResolvedValue([])
  vi.mocked(commitSigapSchedule).mockResolvedValue()
  vi.mocked(remainingCredits).mockResolvedValue({ remaining: 10000 } as never)
  vi.mocked(getContentJob).mockResolvedValue(null)
  vi.mocked(getAccountIdea).mockResolvedValue({ id: IDEA, title: 'Skrip', pillarId: null, script: SCRIPT })
  vi.mocked(enqueueContentJob).mockResolvedValue(A)
})

describe('Sigap scheduling', () => {
  it('schedules ready rows while leaving processing rows alone', async () => {
    vi.mocked(readScheduleItem).mockResolvedValueOnce({ stage: 'processing', reason: 'Tunggu gambar.' } as never)
      .mockResolvedValueOnce({ stage: 'ready' } as never)
    const result = await scheduleFromSigapAction(SESSION, MESSAGE, CARD, [{ postId: A, at: AT }, { postId: B, at: AT }])
    expect(result.results).toEqual([{ postId: A, error: 'Tunggu gambar.' }, { postId: B, error: null }])
    expect(commitSigapSchedule).toHaveBeenCalledExactlyOnceWith('owner', 'account', B, new Date(`${AT}:00+07:00`))
  })

  it('does not trust stale ready state, including failures from the atomic commit', async () => {
    vi.mocked(commitSigapSchedule).mockRejectedValueOnce(new Error('race')).mockResolvedValueOnce()
    const result = await scheduleFromSigapAction(SESSION, MESSAGE, CARD, [{ postId: A, at: AT }, { postId: B, at: AT }])
    expect(result.results[0].error).toBeTruthy()
    expect(result.results[1].error).toBeNull()
  })

  it('rejects foreign sessions and card substitutions', async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    expect((await scheduleFromSigapAction(SESSION, MESSAGE, CARD, [{ postId: A, at: AT }])).error).toBeTruthy()
    expect(getMessage).not.toHaveBeenCalled()
    expect(commitSigapSchedule).not.toHaveBeenCalled()
  })

  it('validates all references before mutating any post', async () => {
    const result = await scheduleFromSigapAction(SESSION, MESSAGE, CARD, [{ postId: A, at: AT }, { postId: IDEA, at: AT }])
    expect(result.error).toBeTruthy()
    expect(commitSigapSchedule).not.toHaveBeenCalled()
  })

  it('refuses repeated references', async () => {
    expect((await scheduleFromSigapAction(SESSION, MESSAGE, CARD, [{ postId: A, at: AT }, { postId: A, at: AT }])).error).toBeTruthy()
    expect(commitSigapSchedule).not.toHaveBeenCalled()
  })

  it.each(['2020-01-01T12:00', 'invalid', null])('rejects past or malformed time %s', async (at) => {
    expect((await scheduleFromSigapAction(SESSION, MESSAGE, CARD, [{ postId: A, at }])).results[0].error).toBeTruthy()
    expect(commitSigapSchedule).not.toHaveBeenCalled()
  })

  it('rejects occupied times', async () => {
    vi.mocked(listTakenTimes).mockResolvedValue([new Date(`${AT}:00+07:00`)])
    expect((await scheduleFromSigapAction(SESSION, MESSAGE, CARD, [{ postId: A, at: AT }])).results[0].error).toContain('terisi')
    expect(commitSigapSchedule).not.toHaveBeenCalled()
  })

  it('is idempotent after a successful request whose response was lost', async () => {
    vi.mocked(readScheduleItem).mockResolvedValue({ stage: 'scheduled', scheduledAt: new Date(`${AT}:00+07:00`).toISOString() } as never)
    expect((await scheduleFromSigapAction(SESSION, MESSAGE, CARD, [{ postId: A, at: AT }])).results).toEqual([{ postId: A, error: null }])
    expect(commitSigapSchedule).not.toHaveBeenCalled()
  })

  it('follows an idea into its generated post', async () => {
    vi.mocked(getMessage).mockResolvedValue({ parts: [{ type: 'schedule', id: CARD, items: [{ kind: 'idea', id: IDEA, title: 'Skrip' }] }] } as never)
    vi.mocked(scheduleIdeaJob).mockResolvedValue({ post_id: A } as never)
    expect((await scheduleFromSigapAction(SESSION, MESSAGE, CARD, [{ postId: A, at: AT }])).results[0].error).toBeNull()
  })
})

describe('images before scheduling', () => {
  it('draws the saved script, with a stable key, without scheduling it', async () => {
    vi.mocked(readScheduleItem).mockResolvedValue({ stage: 'script', postId: null, imageCost: 100 } as never)
    expect(await makeScheduleImagesAction(SESSION, MESSAGE, CARD, IDEA)).toBeNull()
    expect(enqueueContentJob).toHaveBeenCalledExactlyOnceWith('owner', 'account', IDEA, IDEA, 'content', {
      request: expect.objectContaining({ ideaId: IDEA, slides: 2, density: 'ringkas', productGroupId: 'auto' }), script: SCRIPT, attachmentPath: null,
    })
    expect(commitSigapSchedule).not.toHaveBeenCalled()
  })

  it('promotes a script placeholder using its source idea', async () => {
    vi.mocked(readScheduleItem).mockResolvedValue({ stage: 'script', postId: A, imageCost: 100 } as never)
    vi.mocked(getContentJob).mockResolvedValue({ idea_id: IDEA, payload: { density: 'lengkap' } } as never)
    expect(await makeScheduleImagesAction(SESSION, MESSAGE, CARD, A)).toBeNull()
    expect(enqueueContentJob).toHaveBeenCalledWith('owner', 'account', IDEA, IDEA, 'content', expect.objectContaining({ script: SCRIPT }))
  })

  it('refuses generation while busy or when the remaining quota is insufficient', async () => {
    vi.mocked(readScheduleItem).mockResolvedValue({ stage: 'processing', reason: 'Tunggu.' } as never)
    expect(await makeScheduleImagesAction(SESSION, MESSAGE, CARD, IDEA)).toBe('Tunggu.')
    vi.mocked(readScheduleItem).mockResolvedValue({ stage: 'script', postId: null, imageCost: 100 } as never)
    vi.mocked(remainingCredits).mockResolvedValue({ remaining: 99 } as never)
    expect(await makeScheduleImagesAction(SESSION, MESSAGE, CARD, IDEA)).toContain('Kuota')
    expect(enqueueContentJob).not.toHaveBeenCalled()
  })
})
