import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsset, InvalidImageError } from './assets'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0]
const blob = (bytes: number[], size = bytes.length) => {
  const data = new Uint8Array(size)
  data.set(bytes)
  return new Blob([data])
}

describe('createAsset', () => {
  beforeEach(() => {
    vi.mocked(db).mockReset()
  })

  it('rejects a PNG before touching storage', async () => {
    await expect(createAsset('user-1', blob([0x89, 0x50, 0x4e, 0x47]), 1080, 1080)).rejects.toBeInstanceOf(InvalidImageError)
    expect(db).not.toHaveBeenCalled()
  })

  it('rejects a file over 8 MB', async () => {
    await expect(createAsset('user-1', blob(JPEG_HEADER, 8 * 1024 * 1024 + 1), 1080, 1080)).rejects.toThrow('8 MB')
    expect(db).not.toHaveBeenCalled()
  })

  it('rejects impossible dimensions', async () => {
    await expect(createAsset('user-1', blob(JPEG_HEADER), 0, 1080)).rejects.toBeInstanceOf(InvalidImageError)
    expect(db).not.toHaveBeenCalled()
  })
})
