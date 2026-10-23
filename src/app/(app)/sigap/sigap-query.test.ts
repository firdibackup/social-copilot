import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { ChatEvent } from '@/lib/chat-options'
import { conversationQuery, forgetConversation, receiveAnswer, sessionsQuery, sigapKeys, sigapSupportQuery, type Conversation } from './sigap-query'

afterEach(() => vi.unstubAllGlobals())

const answer: Extract<ChatEvent, { type: 'done' }> = {
  type: 'done', sessionId: 'a', created: false,
  user: { id: 'u1', role: 'user', content: 'Halo', parts: [], createdAt: '2026-10-23T00:00:00Z' },
  assistant: { id: 'a1', role: 'assistant', content: 'Hai', parts: [], createdAt: '2026-10-23T00:00:01Z' },
}

describe('Sigap browser cache', () => {
  it('reuses prefetched conversations on A → B → A without reloading support or history', async () => {
    const fetcher = vi.fn(async () => Response.json({ session: { id: 'a' }, messages: [] }))
    vi.stubGlobal('fetch', fetcher)
    const client = new QueryClient()
    try {
      await client.fetchQuery(sessionsQuery('u:ig'))
      await client.fetchQuery(sigapSupportQuery('u:ig'))
      await client.prefetchQuery(conversationQuery('u:ig', 'a'))
      const first = await client.fetchQuery(conversationQuery('u:ig', 'a'))
      await client.fetchQuery(conversationQuery('u:ig', 'b'))
      expect(await client.fetchQuery(conversationQuery('u:ig', 'a'))).toBe(first)
      await client.fetchQuery(sessionsQuery('u:ig'))
      await client.fetchQuery(sigapSupportQuery('u:ig'))
      expect(fetcher).toHaveBeenCalledTimes(4)
      await client.invalidateQueries({ queryKey: sigapKeys.conversation('u:ig', 'a') })
      await client.fetchQuery(conversationQuery('u:ig', 'a'))
      expect(fetcher).toHaveBeenCalledTimes(5)
    } finally { client.clear() }
  })

  it('deduplicates reads and isolates accounts', async () => {
    const fetcher = vi.fn(async () => Response.json({ session: { id: 'a' }, messages: [] }))
    vi.stubGlobal('fetch', fetcher)
    const client = new QueryClient()
    try {
      await Promise.all([client.fetchQuery(conversationQuery('u:ig', 'a')), client.fetchQuery(conversationQuery('u:ig', 'a'))])
      await client.fetchQuery(conversationQuery('u:other', 'a'))
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('scope=u%3Aother'), expect.objectContaining({ cache: 'no-store' }))
    } finally { client.clear() }
  })

  it('updates the original conversation even after navigation, without duplicating messages', async () => {
    const client = new QueryClient()
    try {
      client.setQueryData(sigapKeys.conversation('u:ig', 'a'), { session: { id: 'a' }, messages: [] })
      client.setQueryData(sigapKeys.conversation('u:ig', 'b'), { session: { id: 'b' }, messages: [] })
      await receiveAnswer(client, 'u:ig', answer, () => true)
      await receiveAnswer(client, 'u:ig', answer, () => true)
      expect(client.getQueryData<Conversation>(sigapKeys.conversation('u:ig', 'a'))?.messages).toEqual([answer.user, answer.assistant])
      expect(client.getQueryData<Conversation>(sigapKeys.conversation('u:ig', 'b'))?.messages).toEqual([])
    } finally { client.clear() }
  })

  it('does not restore deleted chats or repopulate the cache after logout', async () => {
    const client = new QueryClient()
    try {
      client.setQueryData(sigapKeys.sessions('u:ig'), [{ id: 'a' }, { id: 'b' }])
      client.setQueryData(sigapKeys.conversation('u:ig', 'a'), { session: { id: 'a' }, messages: [] })
      await forgetConversation(client, 'u:ig', 'a')
      await receiveAnswer(client, 'u:ig', answer, () => true)
      expect(client.getQueryData(sigapKeys.conversation('u:ig', 'a'))).toEqual({ session: null, messages: [] })
      expect(client.getQueryData(sigapKeys.sessions('u:ig'))).toEqual([{ id: 'b' }])
      client.clear()
      await receiveAnswer(client, 'u:ig', { ...answer, created: true }, () => false)
      expect(client.getQueryCache().getAll()).toHaveLength(0)
    } finally { client.clear() }
  })

  it('cancels an old in-flight read before applying a streamed answer', async () => {
    const client = new QueryClient()
    let complete!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { complete = resolve })))
    try {
      client.setQueryData(sigapKeys.conversation('u:ig', 'a'), { session: { id: 'a' }, messages: [] })
      await client.invalidateQueries({ queryKey: sigapKeys.conversation('u:ig', 'a') })
      const loading = client.prefetchQuery(conversationQuery('u:ig', 'a'))
      await receiveAnswer(client, 'u:ig', answer, () => true)
      complete(Response.json({ session: { id: 'a' }, messages: [] }))
      await loading
      expect(client.getQueryData<Conversation>(sigapKeys.conversation('u:ig', 'a'))?.messages).toHaveLength(2)
    } finally { client.clear() }
  })
})
