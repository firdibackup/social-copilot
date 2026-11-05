import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApifyError,
  competitorCacheKey,
  competitorInput,
  findCompetitors,
  getCachedCompetitors,
  KEYWORD_CACHE_TTL_MS,
  MAX_COMPETITORS,
  normalizeCompetitorSearch,
  profilePostsInput,
  readCachedCompetitors,
  readCompetitors,
  readProfilePosts,
  saveCachedCompetitors,
  USERNAME_CACHE_TTL_MS,
} from './apify'

type Result = { data: unknown; error: unknown }
const store = vi.hoisted(() => ({
  read: { data: null, error: null } as Result,
  write: { data: null, error: null } as Result,
  filters: [] as unknown[][],
  upserts: [] as unknown[][],
}))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => (store.filters.push(['eq', ...args]), query),
        gt: (...args: unknown[]) => (store.filters.push(['gt', ...args]), query),
        maybeSingle: async () => store.read,
        upsert: async (...args: unknown[]) => (store.upserts.push(args), store.write),
      }
      return query
    },
  }),
}))

const PROFILE = {
  username: 'KopiKenangan',
  fullName: 'Kopi Kenangan',
  biography: 'Kopi\n\nkekinian',
  followersCount: 1_200_000,
  postsCount: 3_400,
  verified: true,
  profilePicUrl: 'https://cdn.test/pic.jpg?sig=abc',
  latestPosts: [
    {
      caption: 'Promo\nhari ini',
      likesCount: 500,
      commentsCount: 20,
      timestamp: '2026-10-20T03:00:00.000Z',
      type: 'Sidecar',
      url: 'https://www.instagram.com/p/abc/',
      hashtags: ['kopi', 3],
    },
    'rusak',
  ],
}

describe('readCompetitors', () => {
  it('reads a profile with its recent posts', () => {
    expect(readCompetitors([PROFILE])).toEqual([
      {
        username: 'kopikenangan',
        name: 'Kopi Kenangan',
        bio: 'Kopi kekinian',
        followers: 1_200_000,
        postsCount: 3_400,
        verified: true,
        avatar: 'https://cdn.test/pic.jpg?sig=abc',
        recentPosts: [
          {
            caption: 'Promo hari ini',
            likes: 500,
            comments: 20,
            postedAt: '2026-10-20T03:00:00.000Z',
            type: 'Sidecar',
            url: 'https://www.instagram.com/p/abc/',
            hashtags: ['kopi'],
          },
        ],
      },
    ])
  })

  it('skips errors, duplicates and items without a username, and stops at max', () => {
    const items = [
      { username: 'privat', error: 'not_found' },
      { fullName: 'tanpa username' },
      { username: 'evil/path' },
      PROFILE,
      { ...PROFILE, username: 'kopikenangan' },
      { username: 'janjijiwa', followersCount: -1, profilePicUrl: 'http://tidak-aman.test' },
      { username: 'fore' },
    ]

    const found = readCompetitors(items, 2)
    expect(found.map((account) => account.username)).toEqual(['kopikenangan', 'janjijiwa'])
    expect(found[1]).toMatchObject({ followers: null, avatar: null, recentPosts: [] })
    expect(readCompetitors({ error: 'x' })).toEqual([])
  })
})

describe('readProfilePosts', () => {
  const image = { type: 'Image', shortCode: 'img1', url: 'https://www.instagram.com/p/img1/', displayUrl: 'https://cdn.test/1.jpg', images: [], caption: 'Foto' }
  const carousel = {
    type: 'Sidecar',
    shortCode: 'car1',
    url: 'https://www.instagram.com/p/car1/',
    displayUrl: 'https://cdn.test/c0.jpg',
    images: ['https://cdn.test/c1.jpg', 'http://cdn.test/insecure.jpg', 'https://cdn.test/c2.jpg'],
    caption: 'Carousel',
  }

  it('reads photos and every carousel slide into picker posts', () => {
    expect(readProfilePosts([image, carousel])).toEqual([
      { id: 'img1', caption: 'Foto', imageUrl: 'https://cdn.test/1.jpg', images: ['https://cdn.test/1.jpg'], isCarousel: false, permalink: 'https://www.instagram.com/p/img1/' },
      {
        id: 'car1',
        caption: 'Carousel',
        imageUrl: 'https://cdn.test/c1.jpg',
        images: ['https://cdn.test/c1.jpg', 'https://cdn.test/c2.jpg'],
        isCarousel: true,
        permalink: 'https://www.instagram.com/p/car1/',
      },
    ])
  })

  it('skips videos, errors, duplicates and posts without an https image; caps slides', () => {
    const many = Array.from({ length: 30 }, (_, index) => `https://cdn.test/s${index}.jpg`)
    const posts = readProfilePosts([
      { type: 'Video', shortCode: 'vid', displayUrl: 'https://cdn.test/v.jpg' },
      { error: 'not_found', errorDescription: 'private' },
      { type: 'Image', shortCode: 'insecure', displayUrl: 'http://cdn.test/x.jpg' },
      image,
      { ...image, caption: 'dobel' },
      { ...carousel, shortCode: 'big', images: many },
      { ...carousel, shortCode: 'nocover', images: [], url: 'javascript:alert(1)' },
      'rusak',
    ])
    expect(posts.map((post) => post.id)).toEqual(['img1', 'big', 'nocover'])
    expect(posts[1].images).toHaveLength(20)
    expect(posts[2]).toMatchObject({ images: ['https://cdn.test/c0.jpg'], isCarousel: false, permalink: null })
    expect(readProfilePosts({ error: 'x' })).toEqual([])
  })

  it('asks the actor for one profile’s posts', () => {
    expect(profilePostsInput('kopi')).toEqual({ directUrls: ['https://www.instagram.com/kopi/'], resultsType: 'posts', resultsLimit: 24 })
  })
})

describe('competitorInput', () => {
  it('opens profile links for usernames', () => {
    expect(competitorInput({ kind: 'username', usernames: ['a', 'b', 'c'] }, 2)).toEqual({
      directUrls: ['https://www.instagram.com/a/', 'https://www.instagram.com/b/'],
      resultsType: 'details',
      resultsLimit: 6,
    })
  })

  it('searches accounts for a keyword, between one and five', () => {
    expect(competitorInput({ kind: 'keyword', keyword: 'kopi susu' }, 50)).toMatchObject({
      search: 'kopi susu',
      searchType: 'user',
      searchLimit: 5,
    })
    expect(competitorInput({ kind: 'keyword', keyword: 'kopi' }, 0)).toMatchObject({ searchLimit: 1 })
  })
})

describe('findCompetitors', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubEnv('APIFY_TOKEN', 'apify-secret')
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('runs the actor with the token only in the header', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([PROFILE]), { status: 201 }))

    await expect(findCompetitors({ kind: 'username', usernames: ['kopikenangan'] }, 5)).resolves.toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items')
    expect(String(url)).not.toContain('apify-secret')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer apify-secret')
  })

  it('throws an ApifyError with the status and Apify message', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Not enough credit' } }), { status: 402 }))

    const error = await findCompetitors({ kind: 'keyword', keyword: 'kopi' }, 1).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApifyError)
    expect(error).toMatchObject({ status: 402, message: 'Not enough credit' })
  })

  it('reports an unreachable Apify as status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    await expect(findCompetitors({ kind: 'keyword', keyword: 'kopi' }, 1)).rejects.toMatchObject({ status: 0 })
  })
})

describe('competitor cache keys', () => {
  it('normalizes usernames: no @, trimmed, lowercase, unique, sorted, cut to max', () => {
    expect(normalizeCompetitorSearch({ kind: 'username', usernames: ['@KopiKenangan', ' janjiw ', '@kopikenangan'] }, 5)).toEqual({
      search: { kind: 'username', usernames: ['janjiw', 'kopikenangan'] },
      max: 2,
    })
    expect(normalizeCompetitorSearch({ kind: 'username', usernames: ['c', 'b', 'a', 'evil/path'] }, 2)).toEqual({
      search: { kind: 'username', usernames: ['b', 'c'] },
      max: 2,
    })
  })

  it('normalizes keywords and clamps max between one and MAX_COMPETITORS', () => {
    expect(normalizeCompetitorSearch({ kind: 'keyword', keyword: '  Skincare \n  Indonesia! ' }, 50)).toEqual({
      search: { kind: 'keyword', keyword: 'skincare indonesia!' },
      max: MAX_COMPETITORS,
    })
    expect(normalizeCompetitorSearch({ kind: 'keyword', keyword: 'kopi' }, 0).max).toBe(1)
    expect(normalizeCompetitorSearch({ kind: 'keyword', keyword: 'kopi' }, Number.NaN).max).toBe(MAX_COMPETITORS)
  })

  it('gives the same key regardless of order or case, and different keys for different searches', () => {
    const key = competitorCacheKey({ kind: 'username', usernames: ['@KopiKenangan', 'janjiw'] }, 5)
    expect(key).toMatch(/^v1:[0-9a-f]{64}$/)
    expect(competitorCacheKey({ kind: 'username', usernames: ['janjiw', 'kopikenangan', 'KOPIKENANGAN'] }, 5)).toBe(key)
    expect(competitorCacheKey({ kind: 'username', usernames: ['janjiw'] }, 5)).not.toBe(key)
    expect(competitorCacheKey({ kind: 'keyword', keyword: 'Kopi  Susu' }, 3)).toBe(competitorCacheKey({ kind: 'keyword', keyword: 'kopi susu' }, 3))
    expect(competitorCacheKey({ kind: 'keyword', keyword: 'kopi susu' }, 3)).not.toBe(competitorCacheKey({ kind: 'keyword', keyword: 'kopi susu' }, 4))
    // A username and a keyword with the same text never share a row.
    expect(competitorCacheKey({ kind: 'username', usernames: ['kopi'] }, 1)).not.toBe(competitorCacheKey({ kind: 'keyword', keyword: 'kopi' }, 1))
  })

  it('keeps usernames for a day and keywords for half a day', () => {
    expect(USERNAME_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000)
    expect(KEYWORD_CACHE_TTL_MS).toBe(12 * 60 * 60 * 1000)
  })
})

describe('readCachedCompetitors', () => {
  const [account] = readCompetitors([PROFILE])
  const asked = normalizeCompetitorSearch({ kind: 'username', usernames: ['kopikenangan'] }, 5)

  it('accepts what readCompetitors produced', () => {
    expect(readCachedCompetitors(JSON.parse(JSON.stringify([account])), asked)).toEqual([account])
  })

  it('treats a broken, empty, oversized or foreign result as a miss', () => {
    expect(readCachedCompetitors({ username: 'kopikenangan' }, asked)).toBeNull()
    expect(readCachedCompetitors([], asked)).toBeNull()
    expect(readCachedCompetitors([{ ...account, followers: '1k' }], asked)).toBeNull()
    expect(readCachedCompetitors([{ ...account, avatar: 'http://tidak-aman.test' }], asked)).toBeNull()
    expect(readCachedCompetitors([{ ...account, recentPosts: [{ caption: 1 }] }], asked)).toBeNull()
    expect(readCachedCompetitors([account, { ...account, username: 'lain' }], asked)).toBeNull()
    // A row that holds an account nobody asked for is never served under this key.
    expect(readCachedCompetitors([{ ...account, username: 'lain' }], asked)).toBeNull()
  })
})

describe('competitor cache in Supabase', () => {
  const [account] = readCompetitors([PROFILE])
  const search = { kind: 'username' as const, usernames: ['KopiKenangan'] }

  beforeEach(() => {
    store.read = { data: null, error: null }
    store.write = { data: null, error: null }
    store.filters = []
    store.upserts = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reads only an unexpired row under the search key', async () => {
    store.read = { data: { result: [account] }, error: null }

    await expect(getCachedCompetitors(search, 5)).resolves.toEqual([account])
    expect(store.filters).toEqual([
      ['eq', 'cache_key', competitorCacheKey(search, 5)],
      ['gt', 'expires_at', expect.any(String)],
    ])
  })

  it('treats no row (missing or expired), a broken row and a failed read as a miss', async () => {
    await expect(getCachedCompetitors(search, 5)).resolves.toBeNull()
    store.read = { data: { result: { rusak: true } }, error: null }
    await expect(getCachedCompetitors(search, 5)).resolves.toBeNull()
    store.read = { data: null, error: { message: 'connection refused' } }
    await expect(getCachedCompetitors(search, 5)).resolves.toBeNull()
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('upserts a result with its expiry, and never an empty one', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T00:00:00.000Z') })

    await saveCachedCompetitors(search, 5, [])
    expect(store.upserts).toEqual([])
    await saveCachedCompetitors(search, 5, [account])
    await saveCachedCompetitors({ kind: 'keyword', keyword: ' Kopi  Susu ' }, 3, [account])
    expect(store.upserts).toEqual([
      [
        {
          cache_key: competitorCacheKey(search, 5),
          search_kind: 'username',
          normalized_query: 'kopikenangan',
          max_results: 1,
          result: [account],
          created_at: '2026-10-25T00:00:00.000Z',
          expires_at: '2026-10-26T00:00:00.000Z',
        },
        { onConflict: 'cache_key' },
      ],
      [expect.objectContaining({ search_kind: 'keyword', normalized_query: 'kopi susu', max_results: 3, expires_at: '2026-10-25T12:00:00.000Z' }), { onConflict: 'cache_key' }],
    ])
  })

  it('swallows a failed write', async () => {
    store.write = { data: null, error: { message: 'permission denied' } }

    await expect(saveCachedCompetitors(search, 5, [account])).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('[apify] cache gagal disimpan:', expect.any(String), 'Error: Supabase: permission denied')
  })
})
