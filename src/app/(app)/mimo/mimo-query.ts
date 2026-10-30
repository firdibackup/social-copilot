'use client'

import { QueryClient, queryOptions } from '@tanstack/react-query'
import type { ChatEvent, ChatSessionView } from '@/lib/chat-options'
import type { loadMimoConversation, loadMimoSupport } from '@/lib/mimo-data'

export type Conversation = Awaited<ReturnType<typeof loadMimoConversation>>
type Support = Awaited<ReturnType<typeof loadMimoSupport>>
export const mimoKeys = {
  all: (scope: string) => ['mimo', scope] as const,
  sessions: (scope: string) => ['mimo', scope, 'sessions'] as const,
  conversation: (scope: string, id: string) => ['mimo', scope, 'conversation', id] as const,
  support: (scope: string) => ['mimo', scope, 'support'] as const,
}

async function read<T>(scope: string, part: string, signal: AbortSignal, id?: string): Promise<T> {
  const params = new URLSearchParams({ scope, part })
  if (id) params.set('id', id)
  const response = await fetch(`/api/sigap/workspace?${params}`, { signal, cache: 'no-store' })
  if (response.redirected || response.status === 401 || response.status === 409) {
    window.location.reload()
    throw new Error('Sesi berubah. Memuat ulang…')
  }
  if (!response.ok) throw new Error('Mimo belum bisa dimuat. Coba lagi.')
  return response.json()
}

export const sessionsQuery = (scope: string) => queryOptions({
  queryKey: mimoKeys.sessions(scope),
  queryFn: ({ signal }) => read<ChatSessionView[]>(scope, 'sessions', signal),
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  retry: 1,
})

export const conversationQuery = (scope: string, id: string) => queryOptions({
  queryKey: mimoKeys.conversation(scope, id),
  queryFn: ({ signal }) => read<Conversation>(scope, 'conversation', signal, id),
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  retry: 1,
})

export const mimoSupportQuery = (scope: string) => queryOptions({
  queryKey: mimoKeys.support(scope),
  queryFn: ({ signal }) => read<Support>(scope, 'support', signal),
  staleTime: 5 * 60_000,
  gcTime: 10 * 60_000,
  retry: 1,
})

/** Cancel older reads before inserting a saved answer; never resurrect a removed conversation. */
export async function receiveAnswer(client: QueryClient, scope: string, event: Extract<ChatEvent, { type: 'done' }>, current: () => boolean) {
  const queryKey = mimoKeys.conversation(scope, event.sessionId)
  await client.cancelQueries({ queryKey })
  if (!current()) return
  client.setQueryData<Conversation>(queryKey, (previous) => {
    if ((previous && !previous.session) || (!previous && !event.created)) return previous
    const added = new Map([event.user, event.assistant].map((message) => [message.id, message]))
    return {
      session: { id: event.sessionId },
      messages: [...(previous?.messages ?? []).filter((message) => !added.has(message.id)), ...added.values()].slice(-300),
    }
  })
  await client.invalidateQueries({ queryKey: mimoKeys.sessions(scope) })
}

export type ForgottenConversation = { conversation: Conversation | undefined; session: ChatSessionView | undefined }

export async function forgetConversation(client: QueryClient, scope: string, id: string): Promise<ForgottenConversation> {
  await Promise.all([
    client.cancelQueries({ queryKey: mimoKeys.conversation(scope, id) }),
    client.cancelQueries({ queryKey: mimoKeys.sessions(scope) }),
  ])
  const sessions = client.getQueryData<ChatSessionView[]>(mimoKeys.sessions(scope))
  const snapshot = {
    conversation: client.getQueryData<Conversation>(mimoKeys.conversation(scope, id)),
    session: sessions?.find((item) => item.id === id),
  }
  // A tombstone also prevents a late answer from recreating deleted messages.
  client.setQueryData<Conversation>(mimoKeys.conversation(scope, id), { session: null, messages: [] })
  client.setQueryData<ChatSessionView[]>(mimoKeys.sessions(scope), (previous) => previous?.filter((session) => session.id !== id))
  return snapshot
}

export function restoreConversation(client: QueryClient, scope: string, id: string, snapshot: ForgottenConversation) {
  client.setQueryData(mimoKeys.conversation(scope, id), snapshot.conversation)
  if (!snapshot.session) return
  client.setQueryData<ChatSessionView[]>(mimoKeys.sessions(scope), (current) => {
    if (!current || current.some((session) => session.id === id)) return current
    return [snapshot.session!, ...current]
  })
}
