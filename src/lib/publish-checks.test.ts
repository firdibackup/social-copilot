import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleProblem } from './publish-checks'
import { listThreadItems } from './post-threads'
import { getThreadsConnection } from './threads-connection'

vi.mock('./post-threads', () => ({ listThreadItems: vi.fn() }))
vi.mock('./threads-connection', () => ({ getThreadsConnection: vi.fn() }))

beforeEach(() => {
  vi.mocked(listThreadItems).mockResolvedValue([])
  vi.mocked(getThreadsConnection).mockResolvedValue({ status: 'active' } as never)
})

describe('scheduleProblem locale', () => {
  it('forwards English to Threads validation', async () => {
    const target = { postId: 'post-1', instagram: false, threads: true, caption: '', assetIds: [] }
    expect(await scheduleProblem('user-1', 'account-1', target, 'en')).toBe('Threads post #1 is empty: add text or a photo.')
    expect(await scheduleProblem('user-1', 'account-1', target)).toBe('Post Threads #1 kosong: isi teks atau tambahkan foto.')
  })
})
