'use client'

import { useEffect, useRef, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ContentListItem } from '@/lib/posts'
import { isUuid } from '@/lib/params'

/** One lightweight poll for the workspace; render again only when a watched draft changes. */
export function ContentQueuePoll({ posts }: { posts: ContentListItem[] }) {
  const router = useRouter()
  const selectedId = useSearchParams().get('id')
  const [pending, startTransition] = useTransition()
  // A selected post can be outside the list's newest 50; don't refresh forever for that same revision.
  const lastRefresh = useRef('')
  const watched = posts.filter((post) => post.inProgress > 0 || post.id === selectedId)
  const baseline = JSON.stringify(Object.fromEntries(watched.map((post) => [post.id, post.revision])))
  useEffect(() => {
    if (pending) return
    const revisions: Record<string, string> = JSON.parse(baseline)
    if (isUuid(selectedId) && !(selectedId in revisions)) revisions[selectedId] = ''
    const ids = Object.keys(revisions)
    if (ids.length === 0) return
    const controller = new AbortController()
    let running = false
    let changed = false
    const query = new URLSearchParams(ids.map((id) => ['id', id]))
    async function poll() {
      if (running || changed || document.visibilityState !== 'visible') return
      running = true
      try {
        const response = await fetch(`/api/content/status?${query}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok || response.redirected) return
        const next: Record<string, string> = await response.json()
        const fingerprint = JSON.stringify(ids.map((id) => [id, next[id] ?? null]))
        if (!controller.signal.aborted && fingerprint !== lastRefresh.current && ids.some((id) => revisions[id] === '' ? next[id] !== undefined : next[id] !== revisions[id])) {
          changed = true
          lastRefresh.current = fingerprint
          startTransition(() => router.refresh())
        }
      } catch {
        // Keep the last good UI and retry on the next tick.
      } finally { running = false }
    }
    const timer = setInterval(() => void poll(), 4000)
    const onVisible = () => void poll()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      controller.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [baseline, selectedId, pending, router])
  return null
}
