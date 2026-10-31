import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertStorageAvailable, FileTooLargeError, hasStorageRoom, listCleanupCandidates, StorageFullError } from './storage-quota'
import { MAX_STORED_BYTES, STORAGE_FULL_CODE, STORAGE_FULL_MESSAGE, storageFullMessage } from './storage-quota-options'
import { db } from './supabase'

vi.mock('./supabase', () => ({ db: vi.fn() }))

const MB = 1024 * 1024
const usage = (result: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn(async () => result)
  vi.mocked(db).mockReturnValue({ rpc } as never)
  return rpc
}

describe('storage quota', () => {
  beforeEach(() => {
    vi.mocked(db).mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('measures the user through storage_used', async () => {
    const rpc = usage({ data: 10 * MB, error: null })
    expect(await hasStorageRoom('user-1', MB)).toBe(true)
    expect(rpc).toHaveBeenCalledWith('storage_used', { p_user_id: 'user-1' })
  })

  it('refuses a file that would go past the quota', async () => {
    usage({ data: 250 * MB - 100, error: null })
    await expect(assertStorageAvailable('user-1', 200)).rejects.toBeInstanceOf(StorageFullError)
  })

  it('localizes quota failures while preserving a stable code', async () => {
    usage({ data: 250 * MB, error: null })
    await expect(assertStorageAvailable('user-1', 1, 'en')).rejects.toMatchObject({
      code: STORAGE_FULL_CODE,
      message: storageFullMessage('en'),
    })
    expect(new StorageFullError('en').message).not.toMatch(/\d/)
  })

  it('accepts a file that lands exactly on the quota', async () => {
    usage({ data: 250 * MB - 200, error: null })
    await expect(assertStorageAvailable('user-1', 200)).resolves.toBeUndefined()
  })

  it('refuses a file above the per-file limit without asking the database', async () => {
    const rpc = usage({ data: 0, error: null })
    await expect(assertStorageAvailable('user-1', MAX_STORED_BYTES + 1)).rejects.toBeInstanceOf(FileTooLargeError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fails open when usage cannot be read', async () => {
    usage({ data: null, error: { message: 'down' } })
    expect(await hasStorageRoom('user-1', MB)).toBe(true)
  })

  it('never puts numbers in what the user reads', () => {
    expect(new StorageFullError().message).toBe(STORAGE_FULL_MESSAGE)
    for (const message of [STORAGE_FULL_MESSAGE, new FileTooLargeError().message]) expect(message).not.toMatch(/\d/)
  })

  it('lists cleanup candidates by id', async () => {
    const rpc = usage({ data: [{ id: 'a', size_bytes: 1, created_at: '' }, { id: 'b', size_bytes: 2, created_at: '' }], error: null })
    expect(await listCleanupCandidates('user-1')).toEqual(['a', 'b'])
    expect(rpc).toHaveBeenCalledWith('storage_cleanup_candidates', { p_user_id: 'user-1', p_limit: 100 })
  })
})
