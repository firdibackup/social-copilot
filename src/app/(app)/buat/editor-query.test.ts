import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { detailQuery, editorKeys, reviveEditorDates, supportQuery } from './editor-query'

afterEach(() => { vi.unstubAllGlobals() })

describe('editor browser cache', () => {
  it('reuses a prefetched draft on A → B → A and refetches after invalidation', async () => {
    const fetcher = vi.fn(async () => Response.json({ post: { caption: 'Saved', scheduledAt: '2026-10-22T12:00:00Z' } }))
    vi.stubGlobal('fetch', fetcher)
    const client = new QueryClient()
    try {
      await client.prefetchQuery(detailQuery('user:account', 'a'))
      const first = await client.fetchQuery(detailQuery('user:account', 'a'))
      await client.fetchQuery(detailQuery('user:account', 'b'))
      const again = await client.fetchQuery(detailQuery('user:account', 'a'))
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(again).toBe(first)
      expect(again.post?.scheduledAt).toBeInstanceOf(Date)
      await client.invalidateQueries({ queryKey: editorKeys.detail('user:account', 'a') })
      await client.fetchQuery(detailQuery('user:account', 'a'))
      expect(fetcher).toHaveBeenCalledTimes(3)
    } finally { client.clear() }
  })

  it('deduplicates simultaneous reads and separates accounts', async () => {
    const fetcher = vi.fn(async () => Response.json({ post: null }))
    vi.stubGlobal('fetch', fetcher)
    const client = new QueryClient()
    try {
      await Promise.all([client.fetchQuery(detailQuery('u:a', 'p')), client.fetchQuery(detailQuery('u:a', 'p'))])
      await client.fetchQuery(detailQuery('u:b', 'p'))
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('scope=u%3Aa'), expect.objectContaining({ cache: 'no-store' }))
    } finally { client.clear() }
  })

  it('keeps support independent from draft selections', async () => {
    const fetcher = vi.fn(async () => Response.json({ kit: { logoUrl: null } }))
    vi.stubGlobal('fetch', fetcher)
    const client = new QueryClient()
    try {
      await client.fetchQuery(supportQuery('u:a'))
      await client.fetchQuery(supportQuery('u:a'))
      expect(fetcher).toHaveBeenCalledTimes(1)
    } finally { client.clear() }
  })

  it('does not refetch a draft the server already rendered', async () => {
    const fetcher = vi.fn(async () => Response.json({ post: null }))
    vi.stubGlobal('fetch', fetcher)
    const client = new QueryClient()
    try {
      const observer = new QueryObserver(client, { ...detailQuery('u:a', 'p'), initialData: { post: null } as never, initialDataUpdatedAt: Date.now() })
      const stop = observer.subscribe(() => {})
      await new Promise((resolve) => setTimeout(resolve, 0))
      stop()
      expect(fetcher).not.toHaveBeenCalled()
    } finally { client.clear() }
  })

  it('revives nested publication dates without interpreting caption or script text', () => {
    const text = '2026-10-22T12:00:00Z'
    const result = reviveEditorDates({ caption: text, post: { scheduledAt: null, threads: { dueAt: text } } })
    expect(result.caption).toBe(text)
    expect(result.post.scheduledAt).toBeNull()
    expect(result.post.threads.dueAt).toBeInstanceOf(Date)
  })
})
