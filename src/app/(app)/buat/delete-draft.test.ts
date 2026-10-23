import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refresh } from 'next/cache'
import { removeAttachment } from '@/lib/attachments'
import { getContentJob, type ContentJob } from '@/lib/content-jobs'
import { deletePost, getPost, type Post } from '@/lib/posts'
import { deleteDraftAction } from './content-actions'

vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: USER, accountId: ACCOUNT })) }))
vi.mock('@/lib/attachments', () => ({ removeAttachment: vi.fn() }))
vi.mock('@/lib/content-jobs', () => ({ getContentJob: vi.fn() }))
vi.mock('@/lib/posts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/posts')>()),
  getPost: vi.fn(),
  deletePost: vi.fn(),
}))

const USER = '11111111-1111-4111-8111-000000000001'
const ACCOUNT = 'ig-1'
const ID = '22222222-2222-4222-8222-000000000001'
const PATH = `${USER}/lampiran/${ID}.jpg`
const post = { id: ID, status: 'draft', threads: null } as Post
const job: ContentJob = {
  post_id: ID, user_id: USER, account_id: ACCOUNT, idea_id: null,
  kind: 'content', status: 'cancelled', lease: null, error: null,
  payload: { attachmentPath: PATH },
}

describe('deleteDraftAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPost).mockResolvedValue(post)
    vi.mocked(getContentJob).mockResolvedValue(job)
    vi.mocked(deletePost).mockResolvedValue(true)
    vi.mocked(removeAttachment).mockResolvedValue()
  })

  it('deletes a cancelled draft in the active account, then cleans its attachment', async () => {
    expect(await deleteDraftAction(ID)).toBeNull()
    expect(getPost).toHaveBeenCalledWith(USER, ID, ACCOUNT)
    expect(getContentJob).toHaveBeenCalledWith(USER, ID)
    expect(deletePost).toHaveBeenCalledWith(USER, ID)
    expect(removeAttachment).toHaveBeenCalledWith(PATH)
    expect(vi.mocked(deletePost).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(removeAttachment).mock.invocationCallOrder[0])
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('rejects invalid ids without querying posts', async () => {
    expect(await deleteDraftAction('invalid')).toBe('Draft tidak ditemukan.')
    expect(getPost).not.toHaveBeenCalled()
    expect(deletePost).not.toHaveBeenCalled()
  })

  it('does not delete or load dependent data when ownership/account lookup fails', async () => {
    vi.mocked(getPost).mockResolvedValue(null)
    expect(await deleteDraftAction(ID)).toBe('Draft tidak ditemukan.')
    expect(getContentJob).not.toHaveBeenCalled()
    expect(deletePost).not.toHaveBeenCalled()
    expect(removeAttachment).not.toHaveBeenCalled()
  })

  it.each(['pending', 'running'] as const)('requires cancellation before deleting a %s job', async (status) => {
    vi.mocked(getContentJob).mockResolvedValue({ ...job, status })
    expect(await deleteDraftAction(ID)).toContain('Batalkan pembuatan')
    expect(deletePost).not.toHaveBeenCalled()
    expect(removeAttachment).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it.each([
    { ...post, status: 'publishing' } as Post,
    { ...post, threads: { status: 'publishing' } } as Post,
  ])('refuses to delete while a platform is publishing', async (publishing) => {
    vi.mocked(getPost).mockResolvedValue(publishing)
    expect(await deleteDraftAction(ID)).toContain('sedang diterbitkan')
    expect(deletePost).not.toHaveBeenCalled()
  })

  it('keeps attachments when the delete loses a race with publishing', async () => {
    vi.mocked(deletePost).mockResolvedValue(false)
    expect(await deleteDraftAction(ID)).toContain('belum bisa dihapus')
    expect(removeAttachment).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it.each(['cancelled', 'ready'] as const)('deletes %s script drafts without an attachment', async (status) => {
    vi.mocked(getContentJob).mockResolvedValue({ ...job, kind: 'script', status, payload: {} })
    expect(await deleteDraftAction(ID)).toBeNull()
    expect(deletePost).toHaveBeenCalledWith(USER, ID)
    expect(removeAttachment).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('still refreshes after deletion if storage cleanup fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(removeAttachment).mockRejectedValueOnce(new Error('storage unavailable'))
    expect(await deleteDraftAction(ID)).toBeNull()
    expect(log).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it('reports database failure without deleting the attachment', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(deletePost).mockRejectedValueOnce(new Error('database unavailable'))
    expect(await deleteDraftAction(ID)).toBe('Konten gagal dihapus. Coba lagi.')
    expect(removeAttachment).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
