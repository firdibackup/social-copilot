import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCommentRows, getComment, setCommentHiddenRow } from '@/lib/comments'
import { deleteComment, setCommentHidden } from '@/lib/instagram'
import { deleteCommentAction, setCommentHiddenAction } from './comment-actions'

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

const COMMENT = { commentId: '123', isFromOwner: false }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getComment).mockResolvedValue(COMMENT as never)
  vi.mocked(setCommentHidden).mockResolvedValue(undefined)
  vi.mocked(deleteComment).mockResolvedValue(undefined)
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
})
