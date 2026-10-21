import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApifyError, competitorInput, findCompetitors, readCompetitors } from './apify'

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
