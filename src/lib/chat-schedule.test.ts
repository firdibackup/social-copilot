import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readScheduleItem } from './chat-schedule'
import { getContentJob } from './content-jobs'
import { getAccountIdea } from './ideas'
import { getPost } from './posts'
import { scheduleProblem } from './publish-checks'
import { listUnfinishedSlides } from './slides'

vi.mock('./content-jobs', () => ({ getContentJob: vi.fn(), jobWorking: (job: { status: string } | null) => job?.status === 'pending' || job?.status === 'running' }))
vi.mock('./ideas', () => ({ getAccountIdea: vi.fn() }))
vi.mock('./posts', () => ({ getPost: vi.fn() }))
vi.mock('./slides', () => ({ listUnfinishedSlides: vi.fn() }))
vi.mock('./publish-checks', () => ({ scheduleProblem: vi.fn() }))
const REF = { kind: 'post' as const, id: 'post', title: 'Kopi' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPost).mockResolvedValue({ id: 'post', title: 'Kopi', status: 'draft', isLocked: false, caption: 'Kopi pagi',
    instagramEnabled: true, media: [{ assetId: 'photo' }], threads: null, scheduledAt: null } as never)
  vi.mocked(getContentJob).mockResolvedValue(null)
  vi.mocked(listUnfinishedSlides).mockResolvedValue([])
  vi.mocked(scheduleProblem).mockResolvedValue(null)
  vi.mocked(getAccountIdea).mockResolvedValue({ id: 'idea', title: 'Kopi', pillarId: null, script: [{ label: 'Hook', title: 'Kopi', body: '' }, { label: 'CTA', title: 'Coba', body: '' }] })
})

describe('schedule readiness from Buat', () => {
  it('pins post lookup to the connected account', async () => {
    vi.mocked(getPost).mockResolvedValue(null)
    expect((await readScheduleItem('u', 'a', REF)).stage).toBe('gone')
    expect(getPost).toHaveBeenCalledWith('u', 'post', 'a')
    expect(getContentJob).not.toHaveBeenCalled()
  })

  it.each(['pending', 'running'])('blocks %s jobs even if a cover exists', async (status) => {
    vi.mocked(getContentJob).mockResolvedValue({ kind: 'content', status } as never)
    expect((await readScheduleItem('u', 'a', REF)).stage).toBe('processing')
    expect(scheduleProblem).not.toHaveBeenCalled()
  })

  it.each(['pending', 'generating'])('blocks %s slides even if other slides are ready', async (status) => {
    vi.mocked(listUnfinishedSlides).mockResolvedValue([{ status }] as never)
    expect((await readScheduleItem('u', 'a', REF)).stage).toBe('processing')
  })

  it.each(['failed', 'cancelled'])('blocks %s slides instead of publishing an incomplete carousel', async (status) => {
    vi.mocked(listUnfinishedSlides).mockResolvedValue([{ status }] as never)
    expect((await readScheduleItem('u', 'a', REF)).stage).toBe('blocked')
  })

  it('offers images for a ready script placeholder', async () => {
    vi.mocked(getContentJob).mockResolvedValue({ kind: 'script', status: 'ready', idea_id: 'idea' } as never)
    const item = await readScheduleItem('u', 'a', REF)
    expect(item.stage).toBe('script')
    expect(item.imageCost).toBeGreaterThan(0)
    expect(getAccountIdea).toHaveBeenCalledWith('u', 'a', 'idea')
  })

  it('uses platform validation for missing media and Threads connection problems', async () => {
    vi.mocked(scheduleProblem).mockResolvedValue('Threads belum terhubung.')
    expect(await readScheduleItem('u', 'a', REF)).toMatchObject({ stage: 'blocked', reason: 'Threads belum terhubung.' })
  })

  it('rejects invalid Instagram captions', async () => {
    vi.mocked(getPost).mockResolvedValue({ status: 'draft', instagramEnabled: true, caption: 'a'.repeat(3000), media: [] } as never)
    expect((await readScheduleItem('u', 'a', REF)).stage).toBe('blocked')
  })

  it('allows a finished draft', async () => {
    expect(await readScheduleItem('u', 'a', REF)).toMatchObject({ stage: 'ready', postId: 'post' })
  })
})
