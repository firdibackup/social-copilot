'use client'

import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { editorKeys, type EditorDetail } from './editor-query'

/**
 * Posts deleted in this tab. The list and the editor read it synchronously, so a delete shows at once instead of
 * waiting for the URL change, which the router holds back until the delete action's re-render finishes.
 */
let hidden: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()
const EMPTY: ReadonlySet<string> = new Set()

export function setPostVisible(id: string, visible: boolean) {
  if (hidden.has(id) !== visible) return
  const next = new Set(hidden)
  if (visible) next.delete(id)
  else next.add(id)
  hidden = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useHiddenPosts(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => hidden, () => EMPTY)
}

/** Hides the post, leaves the editor for an empty one, and returns how to put everything back if the delete fails. */
export async function removePostOptimistically(client: QueryClient, scope: string, id: string): Promise<() => void> {
  const key = editorKeys.detail(scope, id)
  const emptyKey = editorKeys.detail(scope, '')
  await client.cancelQueries({ queryKey: key })
  const detail = client.getQueryData<EditorDetail>(key)
  // The empty editor renders from what the deleted one already had; marked stale, so it refreshes in the background.
  if (detail && !client.getQueryData(emptyKey)) {
    client.setQueryData<EditorDetail>(emptyKey, { ...detail, post: null, job: null, idea: null, threadItems: [], slides: [] }, { updatedAt: 0 })
  }
  const previousUrl = `${window.location.pathname}${window.location.search}`
  const platform = new URLSearchParams(window.location.search).get('platform')
  setPostVisible(id, false)
  window.history.replaceState(null, '', platform === 'threads' ? '/buat?platform=threads' : '/buat')
  client.removeQueries({ queryKey: key })
  return () => {
    setPostVisible(id, true)
    if (detail) client.setQueryData(key, detail)
    window.history.replaceState(null, '', previousUrl)
  }
}
