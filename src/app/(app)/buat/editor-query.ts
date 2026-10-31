'use client'

import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '@/../messages/id/editor.json'
import enMessages from '@/../messages/en/editor.json'

import { queryOptions } from '@tanstack/react-query'
import type { loadEditorDetail, loadEditorSupport } from '@/lib/editor-data'

export type EditorDetail = Awaited<ReturnType<typeof loadEditorDetail>>
export type EditorSupport = Awaited<ReturnType<typeof loadEditorSupport>>
export const editorKeys = {
  all: (scope: string) => ['editor', scope] as const,
  detail: (scope: string, id: string, idea = '') => ['editor', scope, 'detail', id, idea] as const,
  support: (scope: string) => ['editor', scope, 'support'] as const,
}

/** JSON routes serialize Dates. Only revive known date fields, never user-authored text. */
export function reviveEditorDates<T>(value: T): T {
  const fields = new Set(['scheduledAt', 'publishedAt', 'nextAttemptAt', 'dueAt', 'tokenExpiresAt', 'connectedAt'])
  return JSON.parse(JSON.stringify(value), (key, item) => fields.has(key) && typeof item === 'string' ? new Date(item) : item)
}

async function read<T>(params: URLSearchParams, signal: AbortSignal, locale: Locale = 'id'): Promise<T> {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'editorQuery' })

  const response = await fetch(`/api/content/editor?${params}`, { signal, cache: 'no-store' })
  if (response.redirected || response.status === 401 || response.status === 409) {
    // Discard the in-memory session cache when authentication/account scope changes.
    window.location.reload()
    throw new Error(t('message1'))
  }
  if (!response.ok) throw new Error(t('message2'))
  return reviveEditorDates<T>(await response.json())
}

export function detailQuery(scope: string, id = '', idea = '', locale: Locale = 'id') {
  return queryOptions({
    queryKey: editorKeys.detail(scope, id, idea),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ scope, part: 'detail' })
      if (id) params.set('id', id)
      if (idea) params.set('ide', idea)
      return read<EditorDetail>(params, signal, locale)
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  })
}

export function supportQuery(scope: string, locale: Locale = 'id') {
  return queryOptions({
    queryKey: editorKeys.support(scope),
    queryFn: ({ signal }) => read<EditorSupport>(new URLSearchParams({ scope, part: 'support' }), signal, locale),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  })
}
