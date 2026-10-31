import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueueContentJob } from './content-jobs'
import type { ContentRequest } from './content-options'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ db: () => ({ rpc: mocks.rpc }), unwrap: (result: { data: unknown }) => result.data }))
vi.mock('./storage-quota', () => ({ hasStorageRoom: async () => true, StorageFullError: class extends Error {} }))

const request: ContentRequest = {
  topic: 'Coffee', slides: 3, format: '4:5', referenceId: null, productGroupId: null,
  pillarId: null, includeLogo: false, density: 'seimbang', ideaId: null,
}

beforeEach(() => { mocks.rpc.mockReset().mockResolvedValue({ data: 'post-id' }) })

describe('durable generation language', () => {
  it('persists English at enqueue time and inside the auto request retained by finish_script_job', async () => {
    await enqueueContentJob('owner', 'account', 'key', 'idea', 'script', { auto: { request } }, 'en')
    const payload = mocks.rpc.mock.calls[0][1].p_payload
    expect(payload.language).toBe('en')
    expect(payload.auto.request.language).toBe('en')
    // The SQL transition copies auto.request and changes only its slide count.
    const transitioned = { request: { ...payload.auto.request, slides: 4 }, script: [], attachmentPath: null }
    expect(transitioned.request.language).toBe('en')
    expect(request).not.toHaveProperty('language')
  })

  it('persists English for direct content jobs from the explicit payload option', async () => {
    await enqueueContentJob('owner', 'account', 'key', null, 'content', { request, language: 'en' })
    expect(mocks.rpc.mock.calls[0][1].p_payload).toMatchObject({ language: 'en', request: { language: 'en' } })
  })

  it('defaults existing callers to Indonesian', async () => {
    await enqueueContentJob('owner', 'account', 'key', 'idea', 'script', {})
    expect(mocks.rpc.mock.calls[0][1].p_payload.language).toBe('id')
  })
})
