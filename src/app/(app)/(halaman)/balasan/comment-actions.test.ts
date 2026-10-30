import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCommentRows, getComment, setCommentHiddenRow } from '@/lib/comments'
import { deleteComment, setCommentHidden, InstagramApiError } from '@/lib/instagram'
import { setThreadsReplyHidden } from '@/lib/threads'
import { getThreadsAccount } from '@/lib/threads-connection'
import { getThreadsReply, setThreadsReplyHiddenRow } from '@/lib/threads-inbox'
import { deleteCommentAction, setCommentHiddenAction } from './comment-actions'
import { setThreadsHiddenAction } from './threads-actions'

vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: 'user-1', accountId: 'ig-1' })) }))
vi.mock('@/lib/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connection')>()),
  getPublishingAccount: vi.fn(async () => ({ accessToken: 'token' })),
}))
vi.mock('@/lib/comments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/comments')>()),
  getComment: vi.fn(),
  setCommentHiddenRow: vi.fn(),
  deleteCommentRows: vi.fn(),
}))
vi.mock('@/lib/instagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instagram')>()),
  setCommentHidden: vi.fn(),
  deleteComment: vi.fn(),
}))
vi.mock('@/lib/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/threads')>()),
  setThreadsReplyHidden: vi.fn(),
}))
vi.mock('@/lib/threads-connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/threads-connection')>()),
  getThreadsAccount: vi.fn(),
}))
vi.mock('@/lib/threads-inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/threads-inbox')>()),
  getThreadsReply: vi.fn(),
  setThreadsReplyHiddenRow: vi.fn(),
}))

const COMMENT = { commentId: '123', isFromOwner: false }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getComment).mockResolvedValue(COMMENT as never)
  vi.mocked(setCommentHidden).mockResolvedValue(undefined)
  vi.mocked(deleteComment).mockResolvedValue(undefined)
  vi.mocked(getThreadsReply).mockResolvedValue({ commentId: '456', parentId: null, isFromOwner: false } as never)
  vi.mocked(getThreadsAccount).mockResolvedValue({ accessToken: 'threads-token' } as never)
  vi.mocked(setThreadsReplyHidden).mockResolvedValue(undefined)
})

describe('external comment mutations', () => {
  it('keeps hide successful when Instagram accepted it but the local row failed', async () => {
    vi.mocked(setCommentHiddenRow).mockRejectedValue(new Error('database down'))
    await expect(setCommentHiddenAction('123', true)).resolves.toBeNull()
  })

  it('keeps delete successful when Instagram accepted it but local cleanup failed', async () => {
    vi.mocked(deleteCommentRows).mockRejectedValue(new Error('database down'))
    await expect(deleteCommentAction('123')).resolves.toBeNull()
  })

  it('returns an error when Instagram rejects hide or delete', async () => {
    vi.mocked(setCommentHidden).mockRejectedValueOnce(new InstagramApiError('rejected', 100, 400))
    vi.mocked(deleteComment).mockRejectedValueOnce(new InstagramApiError('rejected', 100, 400))

    await expect(setCommentHiddenAction('123', true)).resolves.toContain('rejected')
    await expect(deleteCommentAction('123')).resolves.toContain('rejected')
  })

  it('keeps Threads hide successful when Threads accepted it but local persistence failed', async () => {
    vi.mocked(setThreadsReplyHiddenRow).mockRejectedValue(new Error('database down'))
    await expect(setThreadsHiddenAction('456', true)).resolves.toBeNull()
  })

  it('returns an error when Threads rejects hide', async () => {
    vi.mocked(setThreadsReplyHidden).mockRejectedValue(new InstagramApiError('rejected', 100, 400))
    await expect(setThreadsHiddenAction('456', true)).resolves.toContain('rejected')
  })
})
