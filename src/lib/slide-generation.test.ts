import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runLogged } from './ai'
import { RouterApiError } from './nine-router'
import { isTransientSlideError, MAX_SLIDE_ATTEMPTS, processSlide } from './slide-generation'
import { failSlide, requeueSlide, SlideError, type ClaimedSlide } from './slides'

vi.mock('./ai', () => ({ runLogged: vi.fn(), aiErrorMessage: () => 'AI gagal.' }))
vi.mock('./app-settings', () => ({ imageModel: vi.fn(async () => 'image-model') }))
vi.mock('./assets', () => ({ createAsset: vi.fn(), loadAssetBytes: vi.fn() }))
vi.mock('./image-ai', () => ({
  drawImage: vi.fn(),
  imageLog: vi.fn(),
  imageErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'gagal'),
}))
vi.mock('./posts', () => ({ getPost: vi.fn() }))
vi.mock('./slide-image', () => ({ toReferenceDataUrl: vi.fn(), toSlideJpeg: vi.fn() }))
vi.mock('./slides', async (importOriginal) => ({
  SlideError: (await importOriginal<typeof import('./slides')>()).SlideError,
  attachSlide: vi.fn(),
  failSlide: vi.fn(),
  findInnerSlideAsset: vi.fn(),
  listUnfinishedSlides: vi.fn(),
  requeueSlide: vi.fn(),
}))

const claimed = (attemptCount: number): ClaimedSlide => ({
  userId: 'user-1',
  accountId: 'ig-1',
  attemptCount,
  slide: {
    id: 'slide-1',
    postId: 'post-1',
    position: 0,
    headline: 'Judul',
    scene: 'Meja kopi',
    format: '4:5',
    role: 'cover',
    referenceImageId: null,
    example: null,
    productGroupId: null,
    includeLogo: false,
    attachmentPath: null,
    attachmentNote: '',
    status: 'generating',
    error: null,
  },
})

beforeEach(() => {
  vi.mocked(runLogged).mockReset()
  vi.mocked(failSlide).mockReset()
  vi.mocked(requeueSlide).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('isTransientSlideError', () => {
  it('retries timeouts, throttling and server errors only', () => {
    expect(isTransientSlideError(new RouterApiError('timeout', 0))).toBe(true)
    expect(isTransientSlideError(new RouterApiError('quota', 429))).toBe(true)
    expect(isTransientSlideError(new RouterApiError('down', 502))).toBe(true)
    expect(isTransientSlideError(new RouterApiError('bad model', 400))).toBe(false)
    expect(isTransientSlideError(new SlideError('Post tidak ditemukan.'))).toBe(false)
  })
})

describe('processSlide', () => {
  it('leaves a made slide alone', async () => {
    vi.mocked(runLogged).mockResolvedValue(undefined)
    await processSlide(claimed(1))
    expect(requeueSlide).not.toHaveBeenCalled()
    expect(failSlide).not.toHaveBeenCalled()
  })

  it('puts a slide back in the queue after a passing failure', async () => {
    vi.mocked(runLogged).mockRejectedValue(new RouterApiError('Layanan sibuk', 503))
    await processSlide(claimed(1))
    expect(requeueSlide).toHaveBeenCalledWith('slide-1', 'Layanan sibuk', 30_000)
    await processSlide(claimed(2))
    expect(requeueSlide).toHaveBeenLastCalledWith('slide-1', 'Layanan sibuk', 120_000)
    expect(failSlide).not.toHaveBeenCalled()
  })

  it('fails the slide on the last attempt', async () => {
    vi.mocked(runLogged).mockRejectedValue(new RouterApiError('Layanan sibuk', 503))
    await processSlide(claimed(MAX_SLIDE_ATTEMPTS))
    expect(failSlide).toHaveBeenCalledWith('slide-1', 'Layanan sibuk')
    expect(requeueSlide).not.toHaveBeenCalled()
  })

  it('fails a lasting failure at once', async () => {
    vi.mocked(runLogged).mockRejectedValue(new SlideError('Post tidak ditemukan.'))
    await processSlide(claimed(1))
    expect(failSlide).toHaveBeenCalledWith('slide-1', 'Post tidak ditemukan.')
    expect(requeueSlide).not.toHaveBeenCalled()
  })
})
