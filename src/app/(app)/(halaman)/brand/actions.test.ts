import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addReference, setReferenceImageLabel, updateReference } from '@/lib/brand'
import { analyzeProfile } from '@/lib/brand-ai'
import { getValidAccessToken } from '@/lib/connection'
import { fetchOwnProfile, fetchRecentMedia } from '@/lib/instagram'
import { fetchImage } from '@/lib/web-fetch'
import { classifyDesigns } from '@/lib/template-ai'
import { ApifyError, fetchProfilePosts } from '@/lib/apify'
import type { InstagramPost } from '@/lib/instagram'
import {
  analyzeProfileAction,
  classifyGridTilesAction,
  importReferencesAction,
  listProfilePostsAction,
  setReferenceLabelAction,
  uploadReferenceAction,
} from './actions'

const scrapes = vi.hoisted(() => ({
  reservation: 'reserved' as string,
  row: null as unknown,
  rpcs: [] as unknown[][],
  updates: [] as unknown[],
}))

vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  db: () => ({
    rpc: async (name: string, args: unknown) => {
      scrapes.rpcs.push([name, args])
      return { data: name === 'reserve_reference_scrape' ? scrapes.reservation : null, error: null }
    },
    from: () => {
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        update: (values: unknown) => (scrapes.updates.push(values), query),
        maybeSingle: async () => ({ data: scrapes.row, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
      }
      return query
    },
  }),
}))
vi.mock('@/lib/apify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/apify')>()),
  fetchProfilePosts: vi.fn(),
}))

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const { idMessages } = await import('@/i18n/messages')
  return { getTranslations: async (namespace: 'brand' | 'assets') => createTranslator({ locale: 'id', messages: idMessages, namespace }) }
})
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'id' }))

vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: 'user-1', accountId: 'ig-1' })) }))
vi.mock('@/lib/brand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/brand')>()),
  addReference: vi.fn(),
  setReferenceImageLabel: vi.fn(),
  updateReference: vi.fn(),
}))
vi.mock('@/lib/template-ai', () => ({ classifyDesigns: vi.fn() }))
vi.mock('@/lib/slide-image', () => ({ toReferenceDataUrl: vi.fn(async () => 'data:image/jpeg;base64,AAAA') }))
vi.mock('@/lib/brand-ai', () => ({ analyzeProfile: vi.fn(), analyzeVisual: vi.fn() }))
vi.mock('@/lib/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connection')>()),
  getValidAccessToken: vi.fn(),
}))
vi.mock('@/lib/instagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instagram')>()),
  fetchOwnProfile: vi.fn(),
  fetchRecentMedia: vi.fn(),
}))
vi.mock('@/lib/web-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/web-fetch')>()),
  fetchImage: vi.fn(),
}))

const IMAGE = { bytes: new Uint8Array([1]), type: 'image/jpeg' as const }
const IMAGE_ID = '0b9c7a0e-3f43-4c2a-9a52-2f5b0d6f1e11'

beforeEach(() => {
  vi.mocked(addReference).mockReset().mockResolvedValue('ref-1')
  vi.mocked(fetchImage).mockReset().mockResolvedValue(IMAGE)
  vi.mocked(setReferenceImageLabel).mockReset().mockResolvedValue(true)
})

describe('importReferencesAction', () => {
  it('imports a carousel as one group with every slide', async () => {
    const result = await importReferencesAction([
      { imageUrls: ['https://cdn/a.jpg', 'https://cdn/b.jpg'], permalink: null, source: 'instagram', sourceLabel: '@kopi' },
    ])

    expect(result).toEqual({ imported: 1, failed: [] })
    expect(fetchImage).toHaveBeenCalledTimes(2)
    expect(addReference).toHaveBeenCalledWith('user-1', 'ig-1', expect.objectContaining({ images: [IMAGE, IMAGE] }))
  })

  it('imports another account’s post as discovery', async () => {
    const result = await importReferencesAction([
      { imageUrls: ['https://cdn/a.jpg'], permalink: 'https://www.instagram.com/p/x/', source: 'discovery', sourceLabel: '@kopi' },
    ])

    expect(result).toEqual({ imported: 1, failed: [] })
    expect(addReference).toHaveBeenCalledWith('user-1', 'ig-1', expect.objectContaining({ source: 'discovery', sourceLabel: '@kopi' }))
  })

  it('still refuses upload as an import source', async () => {
    const result = await importReferencesAction([{ imageUrls: ['https://cdn/a.jpg'], permalink: null, source: 'upload', sourceLabel: 'x' }])

    expect(result).toHaveProperty('error')
    expect(addReference).not.toHaveBeenCalled()
  })

  it('refuses the old one-image shape', async () => {
    const result = await importReferencesAction([{ imageUrl: 'https://cdn/a.jpg', permalink: null, source: 'website', sourceLabel: 'x' }])

    expect(result).toHaveProperty('error')
    expect(addReference).not.toHaveBeenCalled()
  })
})

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' })

describe('uploadReferenceAction', () => {
  it('saves a design cut from a grid with its label and description', async () => {
    vi.mocked(updateReference).mockReset().mockResolvedValue(true)
    const form = new FormData()
    form.set('file', jpeg())
    form.set('label', 'isi')
    form.set('description', ' Nomor besar, poin di bawah. ')
    form.set('source', 'grid')

    await expect(uploadReferenceAction(form)).resolves.toBeNull()

    expect(addReference).toHaveBeenCalledWith(
      'user-1',
      'ig-1',
      expect.objectContaining({ labels: ['isi'], sourceLabel: 'Potongan grid' }),
    )
    expect(updateReference).toHaveBeenCalledWith('user-1', 'ref-1', { description: 'Nomor besar, poin di bawah.' })
  })

  it('saves every design cut from a grid as one group, each with its label', async () => {
    const form = new FormData()
    form.append('file', jpeg())
    form.append('file', jpeg())
    form.append('label', 'cover')
    form.append('label', 'cta')
    form.set('source', 'grid')

    await expect(uploadReferenceAction(form)).resolves.toBeNull()

    expect(addReference).toHaveBeenCalledTimes(1)
    expect(addReference).toHaveBeenCalledWith(
      'user-1',
      'ig-1',
      expect.objectContaining({ images: [expect.anything(), expect.anything()], labels: ['cover', 'cta'] }),
    )
  })

  it('refuses an unknown label', async () => {
    const form = new FormData()
    form.set('file', jpeg())
    form.set('label', 'judul')

    await expect(uploadReferenceAction(form)).resolves.toBe('Label tidak valid.')
    expect(addReference).not.toHaveBeenCalled()
  })
})

describe('classifyGridTilesAction', () => {
  it('returns each tile’s label and description in order, null where the AI read nothing', async () => {
    vi.mocked(classifyDesigns).mockResolvedValue(
      new Map([['tile-2', { styles: ['bold' as const], label: 'cta' as const, note: 'Tombol di bawah' }]]),
    )
    const form = new FormData()
    form.append('tile', jpeg())
    form.append('tile', jpeg())

    await expect(classifyGridTilesAction(form)).resolves.toEqual({
      tiles: [null, { label: 'cta', description: 'Tombol di bawah' }],
    })
    expect(vi.mocked(classifyDesigns).mock.calls[0][1].map((tile) => tile.id)).toEqual(['tile-1', 'tile-2'])
    expect(classifyDesigns).toHaveBeenCalledWith('user-1', expect.any(Array), 'id')
  })

  it('refuses a request without tiles', async () => {
    await expect(classifyGridTilesAction(new FormData())).resolves.toEqual({ error: 'Pilih minimal satu potongan.' })
  })
})

describe('setReferenceLabelAction', () => {
  it('saves a known label', async () => {
    await expect(setReferenceLabelAction(IMAGE_ID, 'cta')).resolves.toBeNull()
    expect(setReferenceImageLabel).toHaveBeenCalledWith('user-1', IMAGE_ID, 'cta')
  })

  it('refuses an unknown label', async () => {
    await expect(setReferenceLabelAction(IMAGE_ID, 'judul')).resolves.toBe('Label tidak valid.')
    expect(setReferenceImageLabel).not.toHaveBeenCalled()
  })
})

describe('analyzeProfileAction', () => {
  it('sends the account’s text to the AI, never the signed picture URL it logs', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token')
    vi.mocked(fetchOwnProfile).mockResolvedValue({
      username: 'kopi',
      name: 'Kopi',
      biography: 'Ngopi',
      profilePictureUrl: 'https://cdn/avatar.jpg?token=x',
    })
    vi.mocked(fetchRecentMedia).mockResolvedValue([])
    vi.mocked(analyzeProfile).mockResolvedValue({ name: 'Kopi' } as never)

    await analyzeProfileAction('', true)

    expect(analyzeProfile).toHaveBeenCalledWith('user-1', expect.any(Object), { language: 'id' })
    expect(vi.mocked(analyzeProfile).mock.calls[0][1].instagram).toEqual({
      username: 'kopi',
      name: 'Kopi',
      biography: 'Ngopi',
      captions: [],
    })
  })
})

describe('listProfilePostsAction', () => {
  const POST: InstagramPost = {
    id: 'abc',
    caption: '',
    imageUrl: 'https://cdn.test/a.jpg',
    images: ['https://cdn.test/a.jpg'],
    isCarousel: false,
    permalink: 'https://www.instagram.com/p/abc/',
  }

  beforeEach(() => {
    scrapes.reservation = 'reserved'
    scrapes.row = null
    scrapes.rpcs = []
    scrapes.updates = []
    vi.mocked(fetchProfilePosts).mockReset().mockResolvedValue([POST])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('scrapes a new username into the picker and stores its posts', async () => {
    await expect(listProfilePostsAction('https://www.instagram.com/KopiKenangan/?hl=id')).resolves.toEqual({
      account: { username: 'kopikenangan', name: '', biography: '', followersCount: null },
      posts: [POST],
    })
    expect(scrapes.rpcs[0]).toEqual(['reserve_reference_scrape', { p_user_id: 'user-1', p_username: 'kopikenangan', p_limit: 3 }])
    expect(fetchProfilePosts).toHaveBeenCalledWith('kopikenangan')
    expect(scrapes.updates).toEqual([expect.objectContaining({ posts: [POST] })])
  })

  it('refuses input that is not a profile', async () => {
    await expect(listProfilePostsAction('https://www.instagram.com/p/abc/')).resolves.toHaveProperty('error')
    expect(scrapes.rpcs).toEqual([])
  })

  it('reports a full week without showing the limit', async () => {
    scrapes.reservation = 'full'

    const result = await listProfilePostsAction('@kopi')

    expect(result).toHaveProperty('error')
    const message = (result as { error: string }).error
    expect(message).toContain('Kuota ambil desain dari akun lain minggu ini sudah habis')
    expect(message).not.toMatch(/\d/)
    expect(fetchProfilePosts).not.toHaveBeenCalled()
  })

  it('serves a username scraped this week from the fresh stored copy without Apify', async () => {
    scrapes.reservation = 'existing'
    scrapes.row = { posts: [POST], fetched_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() }

    await expect(listProfilePostsAction('@kopi')).resolves.toMatchObject({ posts: [POST] })
    expect(fetchProfilePosts).not.toHaveBeenCalled()
    expect(scrapes.rpcs.map(([name]) => name)).toEqual(['reserve_reference_scrape'])
  })

  it('scrapes a stale stored username again without a new slot or a release', async () => {
    scrapes.reservation = 'existing'
    scrapes.row = { posts: [POST], fetched_at: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString() }

    await expect(listProfilePostsAction('@kopi')).resolves.toMatchObject({ posts: [POST] })
    expect(fetchProfilePosts).toHaveBeenCalledTimes(1)
    expect(scrapes.updates).toHaveLength(1)
  })

  it('gives the slot back when Apify fails on a new username', async () => {
    vi.mocked(fetchProfilePosts).mockRejectedValue(new ApifyError('Not enough credit', 402))

    const result = await listProfilePostsAction('@kopi')

    expect(result).toHaveProperty('error')
    expect(scrapes.rpcs.map(([name]) => name)).toEqual(['reserve_reference_scrape', 'release_reference_scrape'])
    expect(scrapes.rpcs[1][1]).toEqual({ p_user_id: 'user-1', p_username: 'kopi' })
  })

  it('gives the slot back when the profile has no photo posts', async () => {
    vi.mocked(fetchProfilePosts).mockResolvedValue([])

    await expect(listProfilePostsAction('@kopi')).resolves.toEqual({
      error: expect.stringContaining('@kopi'),
    })
    expect(scrapes.rpcs.map(([name]) => name)).toContain('release_reference_scrape')
  })
})
