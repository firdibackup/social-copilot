import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runLogged } from './ai'
import { RouterApiError } from './nine-router'
import { isTransientSlideError, MAX_SLIDE_ATTEMPTS, processSlide } from './slide-generation'
import { failSlide, requeueSlide, SlideError, type ClaimedSlide } from './slides'
import { GenerationCancelled, slideAttemptActive } from './generation-cancellation'
import { drawImage } from './image-ai'
import { createAsset } from './assets'
import { getPost } from './posts'
import { attachSlide, listUnfinishedSlides } from './slides'

vi.mock('./ai', () => ({ runLogged: vi.fn(), aiErrorMessage: () => 'AI gagal.' }))
vi.mock('./app-settings', () => ({ imageModel: vi.fn(async () => 'image-model') }))
vi.mock('./assets', () => ({ createAsset: vi.fn(), loadAssetBytes: vi.fn() }))
vi.mock('./image-ai', () => ({
  drawImage: vi.fn(),
  imageLog: vi.fn(),
  imageErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'gagal'),
}))
vi.mock('./posts', () => ({ getPost: vi.fn() }))
vi.mock('./generation-cancellation', async (original) => ({ ...(await original<typeof import('./generation-cancellation')>()), slideAttemptActive: vi.fn() }))
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
  lease: 'attempt-lease',
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
  vi.mocked(slideAttemptActive).mockReset().mockResolvedValue(true)
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
  it('stops a cancelled attempt without retrying it', async () => {
    vi.mocked(slideAttemptActive).mockResolvedValue(false)
    await processSlide(claimed(1))
    expect(runLogged).not.toHaveBeenCalled()
    expect(failSlide).not.toHaveBeenCalled()
    expect(requeueSlide).not.toHaveBeenCalled()
  })

  it('discards an image returned after cancellation before storing or attaching it', async () => {
    vi.mocked(runLogged).mockImplementation(async (_user, _task, _input, ask) => ask())
    vi.mocked(getPost).mockResolvedValue({ media: [] } as never)
    vi.mocked(listUnfinishedSlides).mockResolvedValue([claimed(1).slide])
    vi.mocked(drawImage).mockImplementation(async () => {
      vi.mocked(slideAttemptActive).mockResolvedValue(false)
      return { bytes: new Uint8Array(), prompt: '', sent: [], skipped: [] } as never
    })
    await processSlide(claimed(1))
    expect(createAsset).not.toHaveBeenCalled()
    expect(attachSlide).not.toHaveBeenCalled()
    expect(failSlide).not.toHaveBeenCalled()
    expect(requeueSlide).not.toHaveBeenCalled()
  })

  it('does not classify explicit cancellation as a transient provider failure', () => {
    expect(isTransientSlideError(new GenerationCancelled())).toBe(false)
  })

  it('leaves a made slide alone', async () => {
    vi.mocked(runLogged).mockResolvedValue(undefined)
    await processSlide(claimed(1))
    expect(requeueSlide).not.toHaveBeenCalled()
    expect(failSlide).not.toHaveBeenCalled()
  })

  it('puts a slide back in the queue after a passing failure', async () => {
    vi.mocked(runLogged).mockRejectedValue(new RouterApiError('Layanan sibuk', 503))
    await processSlide(claimed(1))
    expect(requeueSlide).toHaveBeenCalledWith('slide-1', 'Layanan sibuk', 30_000, 'attempt-lease')
    await processSlide(claimed(2))
    expect(requeueSlide).toHaveBeenLastCalledWith('slide-1', 'Layanan sibuk', 120_000, 'attempt-lease')
    expect(failSlide).not.toHaveBeenCalled()
  })

  it('fails the slide on the last attempt', async () => {
    vi.mocked(runLogged).mockRejectedValue(new RouterApiError('Layanan sibuk', 503))
    await processSlide(claimed(MAX_SLIDE_ATTEMPTS))
    expect(failSlide).toHaveBeenCalledWith('slide-1', 'Layanan sibuk', 'attempt-lease')
    expect(requeueSlide).not.toHaveBeenCalled()
  })

  it('fails a lasting failure at once', async () => {
    vi.mocked(runLogged).mockRejectedValue(new SlideError('Post tidak ditemukan.'))
    await processSlide(claimed(1))
    expect(failSlide).toHaveBeenCalledWith('slide-1', 'Post tidak ditemukan.', 'attempt-lease')
    expect(requeueSlide).not.toHaveBeenCalled()
  })
})
