import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostLockedError, savePost } from '@/lib/posts'
import { hasSlidesInProgress } from '@/lib/slides'
import { savePostAction } from './actions'

vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: USER, accountId: 'ig-1' })) }))
vi.mock('@/lib/posts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/posts')>()),
  savePost: vi.fn(),
}))
vi.mock('@/lib/slides', () => ({ hasSlidesInProgress: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`)
  }),
}))

const USER = 'user-1'
const PHOTO = '00000000-0000-4000-8000-000000000001'
const POST_ID = '11111111-1111-4111-8111-000000000001'

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    for (const item of [value].flat()) data.append(key, item)
  }
  return data
}

const submit = (fields: Record<string, string | string[]>) => savePostAction({ error: null }, form(fields))

describe('savePostAction', () => {
  beforeEach(() => {
    vi.mocked(savePost).mockReset().mockResolvedValue(POST_ID)
    vi.mocked(hasSlidesInProgress).mockReset().mockResolvedValue(false)
    vi.useFakeTimers({ now: new Date('2026-10-14T05:00:00Z'), toFake: ['Date'] })
  })

  it('saves an empty draft', async () => {
    await expect(submit({ intent: 'draft', caption: '' })).rejects.toThrow(`REDIRECT /buat?id=${POST_ID}&ok=draft`)
    expect(savePost).toHaveBeenCalledWith(USER, { id: null, caption: '', status: 'draft', scheduledAt: null, assetIds: [] })
  })

  it('schedules in WIB', async () => {
    await expect(
      submit({ intent: 'schedule', caption: 'Halo', assetId: PHOTO, scheduledAt: '2026-10-14T19:00' }),
    ).rejects.toThrow('REDIRECT')
    expect(savePost).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ status: 'scheduled', scheduledAt: new Date('2026-10-14T12:00:00Z'), assetIds: [PHOTO] }),
    )
  })

  it('publishes now at the current time', async () => {
    await expect(submit({ intent: 'now', caption: 'Halo', assetId: PHOTO })).rejects.toThrow('ok=now')
    expect(savePost).toHaveBeenCalledWith(USER, expect.objectContaining({ scheduledAt: new Date('2026-10-14T05:00:00Z') }))
  })

  it('refuses to schedule without photos', async () => {
    const state = await submit({ intent: 'schedule', caption: 'Halo', scheduledAt: '2026-10-14T19:00' })
    expect(state.error).toContain('minimal 1 foto')
    expect(savePost).not.toHaveBeenCalled()
  })

  it('refuses a schedule in the past', async () => {
    const state = await submit({ intent: 'schedule', assetId: PHOTO, scheduledAt: '2026-10-14T11:00' })
    expect(state.error).toContain('sudah lewat')
  })

  it('refuses a schedule without a date', async () => {
    const state = await submit({ intent: 'schedule', assetId: PHOTO, scheduledAt: '' })
    expect(state.error).toContain('Isi tanggal')
  })

  it('counts CRLF newlines once, as Instagram does', async () => {
    const caption = `${'a'.repeat(1099)}\r\n${'b'.repeat(1100)}`
    await expect(submit({ intent: 'draft', caption })).rejects.toThrow('REDIRECT')
    expect(vi.mocked(savePost).mock.calls[0][1].caption).toHaveLength(2200)
  })

  it('ignores ids that are not uuids', async () => {
    await expect(submit({ intent: 'draft', id: "1' or '1'='1", assetId: ['nope', PHOTO] })).rejects.toThrow('REDIRECT')
    expect(savePost).toHaveBeenCalledWith(USER, expect.objectContaining({ id: null, assetIds: [PHOTO] }))
  })

  it('explains a locked post', async () => {
    vi.mocked(savePost).mockRejectedValue(new PostLockedError('Post sedang atau mungkin sudah diterbitkan'))
    const state = await submit({ intent: 'draft', id: POST_ID })
    expect(state.error).toContain('sudah diterbitkan')
  })

  it('waits while AI slides are still being made, so their photos are not dropped', async () => {
    vi.mocked(hasSlidesInProgress).mockResolvedValue(true)
    const state = await submit({ intent: 'schedule', id: POST_ID, assetId: PHOTO, scheduledAt: '2026-10-14T19:00' })
    expect(state.error).toContain('Tunggu semua slide')
    expect(savePost).not.toHaveBeenCalled()
  })

  it('does not ask about slides for a new post', async () => {
    await expect(submit({ intent: 'draft', caption: 'Halo' })).rejects.toThrow('REDIRECT')
    expect(hasSlidesInProgress).not.toHaveBeenCalled()
  })
})
