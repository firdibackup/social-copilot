import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addMessage, getMessage, getSession, loadHistory } from './chat'
import { answerChat, summarizeChat } from './chat-ai'
import { followChatJob, processChatJob } from './chat-jobs'
import type { ChatEvent, ChatMessageView } from './chat-options'

vi.mock('server-only', () => ({}))

/** What the code wrote to chat_jobs, and the row a follower reads next. */
const store = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[], rows: [] as (Record<string, unknown> | null)[] }))
vi.mock('./supabase', () => {
  const builder = (update?: Record<string, unknown>) => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) chain[method] = () => chain
    chain.update = (values: Record<string, unknown>) => builder(values)
    chain.maybeSingle = async () => ({ data: store.rows.length > 1 ? store.rows.shift() : store.rows[0], error: null })
    chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      if (update) store.updates.push(update)
      return Promise.resolve({ data: null, error: null }).then(resolve, reject)
    }
    return chain
  }
  return { db: () => ({ from: () => builder() }), unwrap: (result: { data: unknown }) => result.data }
})
vi.mock('./chat', () => ({ addMessage: vi.fn(), getMessage: vi.fn(), getSession: vi.fn(), loadHistory: vi.fn() }))
vi.mock('./chat-ai', () => ({ answerChat: vi.fn(), summarizeChat: vi.fn(), persistableParts: (parts: unknown[]) => parts }))

const message = (id: string, role: 'user' | 'assistant', content: string): ChatMessageView => ({ id, role, content, parts: [], createdAt: '2026-11-24T00:00:00Z' })
const session = { id: 'session-1', title: 'Chat', summary: '', summarizedCount: 0 }
const job = {
  id: 'job-1', user_id: 'user-1', account_id: 'ig-1', session_id: 'session-1', user_message_id: 'm-user', assistant_message_id: null,
  payload: { turn: { text: 'Halo', images: [], pdf: null }, deepSearch: false, language: 'id' as const, contentLanguage: 'mixed' as const, created: true },
  status: 'running' as const, tool: null,
}

beforeEach(() => {
  store.updates.length = 0
  store.rows.length = 0
  vi.mocked(getSession).mockReset().mockResolvedValue(session)
  vi.mocked(loadHistory).mockReset().mockResolvedValue([message('m-old', 'assistant', 'Sebelumnya'), message('m-user', 'user', 'Halo')])
  vi.mocked(answerChat).mockReset().mockResolvedValue({ content: 'Jawaban', parts: [] })
  vi.mocked(addMessage).mockReset().mockResolvedValue(message('m-answer', 'assistant', 'Jawaban'))
  vi.mocked(summarizeChat).mockReset().mockResolvedValue()
  vi.mocked(getMessage).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('processChatJob', () => {
  it('answers the stored message once, stores the answer and ends the job without what it held', async () => {
    await processChatJob(job)

    const request = vi.mocked(answerChat).mock.calls[0][0]
    // The owner's message is this turn, not history: Mimo must not read it twice.
    expect(request.history.map((item) => item.id)).toEqual(['m-old'])
    expect(request).toMatchObject({ userId: 'user-1', accountId: 'ig-1', turn: job.payload.turn, language: 'id', contentLanguage: 'mixed' })
    expect(addMessage).toHaveBeenCalledWith('user-1', 'session-1', { role: 'assistant', content: 'Jawaban', parts: [] })
    expect(store.updates.at(-1)).toMatchObject({ status: 'done', assistant_message_id: 'm-answer', payload: { created: true }, tool: null })
    expect(summarizeChat).toHaveBeenCalledWith('user-1', session, 'id')
  })

  it('writes the tool Mimo is on, for the waiting line', async () => {
    vi.mocked(answerChat).mockImplementation(async (request) => {
      request.onTool?.('web_search')
      return { content: 'Jawaban', parts: [] }
    })
    await processChatJob(job)
    expect(store.updates).toContainEqual({ tool: 'web_search' })
  })

  it('ends the job as failed, and never throws, when the answer cannot be made or its conversation is gone', async () => {
    vi.mocked(answerChat).mockRejectedValue(new Error('9Router down'))
    await expect(processChatJob(job)).resolves.toBeUndefined()
    expect(store.updates.at(-1)).toMatchObject({ status: 'failed', payload: { created: true } })
    expect(addMessage).not.toHaveBeenCalled()

    store.updates.length = 0
    vi.mocked(getSession).mockResolvedValue(null)
    await processChatJob(job)
    expect(answerChat).toHaveBeenCalledTimes(1)
    expect(store.updates.at(-1)).toMatchObject({ status: 'failed' })
  })
})

describe('followChatJob', () => {
  const follow = async () => {
    const events: ChatEvent[] = []
    const ended = await followChatJob('user-1', 'job-1', (event) => events.push(event), 'Jawaban gagal dibuat.')
    return { events, ended }
  }

  it('says each new tool once, then hands over both messages', async () => {
    vi.useFakeTimers()
    try {
      store.rows.push(
        { ...job, status: 'pending' },
        { ...job, tool: 'web_search' },
        { ...job, tool: 'web_search' },
        { ...job, status: 'done', assistant_message_id: 'm-answer', payload: { created: true } },
      )
      vi.mocked(getMessage).mockImplementation(async (_user, _session, id) => (id === 'm-user' ? message('m-user', 'user', 'Halo') : message('m-answer', 'assistant', 'Jawaban')))
      const result = follow()
      await vi.runAllTimersAsync()
      const { events, ended } = await result
      expect(ended).toBe(true)
      expect(events).toEqual([
        { type: 'tool', name: 'web_search' },
        { type: 'done', sessionId: 'session-1', created: true, user: message('m-user', 'user', 'Halo'), assistant: message('m-answer', 'assistant', 'Jawaban') },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('tells the owner when the answer failed or the job is not theirs', async () => {
    store.rows.push({ ...job, status: 'failed' })
    expect((await follow()).events).toEqual([{ type: 'error', sessionId: 'session-1', message: 'Jawaban gagal dibuat.' }])

    store.rows.length = 0
    store.rows.push(null)
    expect((await follow()).events).toEqual([{ type: 'error', sessionId: '', message: 'Jawaban gagal dibuat.' }])
  })

  it('stops without a last event when the reader left: the chat follows again', async () => {
    store.rows.push({ ...job, status: 'pending' })
    const controller = new AbortController()
    controller.abort()
    const events: ChatEvent[] = []
    await expect(followChatJob('user-1', 'job-1', (event) => events.push(event), 'x', controller.signal)).resolves.toBe(false)
    expect(events).toEqual([])
  })
})
