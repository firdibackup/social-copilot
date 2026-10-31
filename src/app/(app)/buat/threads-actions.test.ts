import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editThread, writeThread } from '@/lib/threads-ai'
import { threadsAiAction } from './threads-actions'

vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: 'user-1', accountId: 'ig-1' })) }))
vi.mock('@/lib/threads-ai', () => ({ writeThread: vi.fn(), editThread: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('threadsAiAction', () => {
  it('validates the chain, instruction and target before calling AI', async () => {
    await expect(threadsAiAction({ texts: 'bad', instruction: 'Tulis', target: null })).resolves.toEqual({ error: 'Rantai Threads tidak valid.' })
    await expect(threadsAiAction({ texts: [''], instruction: '', target: null })).resolves.toEqual({ error: 'Tulis perubahan yang diinginkan dulu.' })
    await expect(threadsAiAction({ texts: ['Ada'], instruction: 'Ubah', target: 1 })).resolves.toEqual({ error: 'Post Threads tidak ditemukan.' })
    expect(writeThread).not.toHaveBeenCalled()
    expect(editThread).not.toHaveBeenCalled()
  })

  it('writes a new chain when every current post is blank', async () => {
    vi.mocked(writeThread).mockResolvedValue(['Hook', 'Isi'])
    await expect(threadsAiAction({ texts: ['', '  '], instruction: 'Tips kopi', target: null })).resolves.toEqual({ texts: ['Hook', 'Isi'] })
    expect(writeThread).toHaveBeenCalledWith('user-1', 'Tips kopi', 'id')
    expect(editThread).not.toHaveBeenCalled()
  })

  it('edits and may replace the whole chain', async () => {
    vi.mocked(editThread).mockResolvedValue(['Hook baru', 'Isi baru', 'CTA'])
    await expect(threadsAiAction({ texts: ['Hook lama', 'Isi lama'], instruction: 'Tambah CTA', target: null })).resolves.toEqual({ texts: ['Hook baru', 'Isi baru', 'CTA'] })
    expect(editThread).toHaveBeenCalledWith('user-1', ['Hook lama', 'Isi lama'], 'Tambah CTA', null, 'id')
  })

  it('replaces only the targeted post', async () => {
    vi.mocked(editThread).mockResolvedValue(['Isi baru'])
    await expect(threadsAiAction({ texts: ['Hook', 'Isi', 'CTA'], instruction: 'Lebih santai', target: 1 })).resolves.toEqual({ texts: ['Hook', 'Isi baru', 'CTA'] })
    expect(editThread).toHaveBeenCalledWith('user-1', ['Hook', 'Isi', 'CTA'], 'Lebih santai', 1, 'id')
  })

  it('splits an over-long generated post when the result still fits ten posts', async () => {
    vi.mocked(writeThread).mockResolvedValue([`${'kata '.repeat(120)}selesai`])
    const result = await threadsAiAction({ texts: [''], instruction: 'Topik', target: null })
    expect('texts' in result && result.texts.length).toBe(2)
    if ('texts' in result) expect(result.texts.every((text) => text.length <= 500)).toBe(true)
  })

  it('splits an over-long targeted post while preserving the rest of the chain', async () => {
    vi.mocked(editThread).mockResolvedValue([`${'kata '.repeat(120)}selesai`])
    const result = await threadsAiAction({ texts: ['Hook', 'Isi', 'CTA'], instruction: 'Panjang', target: 1 })
    expect(result).toMatchObject({ texts: ['Hook', expect.any(String), expect.any(String), 'CTA'] })
  })

  it('maps an answer that cannot fit to the standard AI output error', async () => {
    vi.mocked(editThread).mockResolvedValue(Array.from({ length: 10 }, () => 'x'.repeat(501)))
    const result = await threadsAiAction({ texts: ['Ada'], instruction: 'Panjang', target: null })
    expect(result).toEqual({ error: expect.stringContaining('Jawaban AI tidak bisa dibaca') })
  })
})

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'id',
  getTranslations: async (namespace: string) => {
    const { createTranslator } = await import('next-intl')
    const { default: editor } = await import('../../../../messages/id/editor.json')
    return createTranslator({ locale: 'id', messages: { editor }, namespace: namespace as 'editor' })
  },
}))
