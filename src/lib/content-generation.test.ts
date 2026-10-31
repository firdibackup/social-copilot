import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAccountBrandContext } from './ai'
import { getConnectedAccountId } from './connection'
import { planContent, writeScript } from './content-ai'
import { processContentJob } from './content-generation'
import { failContentJob, type ContentJob } from './content-jobs'
import { getAccountIdea } from './ideas'
import { createContentPost } from './posts'
import { db } from './supabase'
import { contentAttemptActive, GenerationCancelled } from './generation-cancellation'

vi.mock('./ai', () => ({ loadAccountBrandContext: vi.fn(), aiErrorMessage: () => 'AI gagal' }))
vi.mock('./connection', () => ({ getConnectedAccountId: vi.fn() }))
vi.mock('./content-ai', () => ({ planContent: vi.fn(), writeScript: vi.fn() }))
vi.mock('./content-jobs', () => ({ failContentJob: vi.fn() }))
vi.mock('./generation-cancellation', async (original) => ({ ...(await original<typeof import('./generation-cancellation')>()), contentAttemptActive: vi.fn() }))
vi.mock('./ideas', () => ({ getAccountIdea: vi.fn() }))
vi.mock('./posts', async (original) => ({ ...(await original<typeof import('./posts')>()), createContentPost: vi.fn() }))
vi.mock('./supabase', async (original) => ({ ...(await original<typeof import('./supabase')>()), db: vi.fn() }))

const rpc = vi.fn()
const job: ContentJob = {
  post_id: 'draft', user_id: 'owner', account_id: 'instagram', idea_id: 'idea', kind: 'script', status: 'running',
  lease: 'worker-lease', error: null, payload: { density: 'lengkap' },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getConnectedAccountId).mockResolvedValue('instagram')
  vi.mocked(contentAttemptActive).mockResolvedValue(true)
  vi.mocked(loadAccountBrandContext).mockResolvedValue(null)
  vi.mocked(db).mockReturnValue({ rpc } as never)
  rpc.mockResolvedValue({ data: null, error: null })
})

describe('durable content worker', () => {
  it('does not call AI for a cancelled or superseded attempt', async () => {
    vi.mocked(contentAttemptActive).mockResolvedValue(false)
    await processContentJob(job)
    expect(writeScript).not.toHaveBeenCalled()
    expect(planContent).not.toHaveBeenCalled()
    expect(failContentJob).not.toHaveBeenCalled()
  })

  it('discards a late script result after cancellation', async () => {
    vi.mocked(getAccountIdea).mockResolvedValue({ id: 'idea', title: 'Kopi', script: null, pillarId: null })
    vi.mocked(writeScript).mockImplementation(async (_user, _idea, save) => {
      vi.mocked(contentAttemptActive).mockResolvedValue(false)
      await expect(save([])).rejects.toBeInstanceOf(GenerationCancelled)
      throw new GenerationCancelled()
    })
    await processContentJob(job)
    expect(rpc).not.toHaveBeenCalled()
    expect(failContentJob).not.toHaveBeenCalled()
  })

  it('stores a script only through the claimed lease and uses the original account and density', async () => {
    vi.mocked(getAccountIdea).mockResolvedValue({ id: 'idea', title: 'Kopi', script: null, pillarId: null })
    vi.mocked(writeScript).mockImplementation(async (_user, _idea, save) => { await save([]); return [] })

    await processContentJob(job)

    expect(getAccountIdea).toHaveBeenCalledWith('owner', 'instagram', 'idea')
    expect(loadAccountBrandContext).toHaveBeenCalledWith('owner', 'instagram')
    expect(writeScript).toHaveBeenCalledWith('owner', expect.anything(), expect.any(Function), '', null, expect.any(AbortSignal), 'lengkap', 'id')
    expect(rpc).toHaveBeenCalledWith('finish_script_job', { p_post_id: 'draft', p_lease: 'worker-lease', p_script: [] })
    expect(failContentJob).not.toHaveBeenCalled()
  })

  it('writes a bulk plan\'s script from its approved brief', async () => {
    vi.mocked(getAccountIdea).mockResolvedValue({ id: 'idea', title: 'Kopi', script: null, pillarId: null })
    vi.mocked(writeScript).mockImplementation(async (_user, _idea, save) => { await save([]); return [] })

    await processContentJob({ ...job, payload: { density: 'lengkap', brief: 'Tulis tepat 4 slide.' } })

    expect(writeScript).toHaveBeenCalledWith('owner', expect.anything(), expect.any(Function), 'Tulis tepat 4 slide.', null, expect.any(AbortSignal), 'lengkap', 'id')
  })

  it('passes a queued English locale to script generation without request cookies', async () => {
    vi.mocked(getAccountIdea).mockResolvedValue({ id: 'idea', title: 'Coffee', script: null, pillarId: null })
    await processContentJob({ ...job, payload: { ...job.payload, language: 'en' } })
    expect(vi.mocked(writeScript).mock.calls[0].at(-1)).toBe('en')
  })

  it('recovers English after the SQL auto-script transition rebuilds the payload', async () => {
    const request = { topic: 'Coffee', slides: 2, format: '4:5' as const, referenceId: null, productGroupId: null,
      pillarId: null, includeLogo: false, density: 'seimbang' as const, ideaId: 'idea', language: 'en' as const }
    await processContentJob({ ...job, kind: 'content', payload: { request, script: [] } })
    expect(vi.mocked(planContent).mock.calls[0].at(-1)).toBe('en')
    expect(failContentJob).not.toHaveBeenCalled()
  })

  it('does not spend on AI for an account that was switched after enqueue', async () => {
    vi.mocked(getConnectedAccountId).mockResolvedValue('other-account')
    await processContentJob(job)
    expect(writeScript).not.toHaveBeenCalled()
    expect(planContent).not.toHaveBeenCalled()
    expect(failContentJob).toHaveBeenCalledWith(job, expect.stringContaining('Akun Instagram berubah'))
  })

  it('persists failure so the owner can retry after closing the browser', async () => {
    vi.mocked(getAccountIdea).mockResolvedValue({ id: 'idea', title: 'Kopi', script: null, pillarId: null })
    vi.mocked(writeScript).mockRejectedValue(new Error('provider timeout'))
    await processContentJob(job)
    expect(failContentJob).toHaveBeenCalledWith(job, 'AI gagal')
  })

  it('finishes caption and slides into the existing draft rather than creating another post', async () => {
    const request = { topic: 'Kopi', slides: 1, format: '4:5' as const, referenceId: null, productGroupId: null,
      pillarId: null, includeLogo: false, density: 'seimbang' as const, ideaId: 'idea' }
    const plan = { title: 'Kopi', caption: 'Caption', slides: [] }
    vi.mocked(planContent).mockImplementation(async (_user, _request, save) => ({ plan, saved: await save(plan) }))
    vi.mocked(createContentPost).mockResolvedValue('draft')

    await processContentJob({ ...job, kind: 'content', payload: { request } })

    expect(createContentPost).toHaveBeenCalledWith('owner', request, plan, expect.any(Array), null,
      { postId: 'draft', lease: 'worker-lease' })
    expect(failContentJob).not.toHaveBeenCalled()
  })
})
