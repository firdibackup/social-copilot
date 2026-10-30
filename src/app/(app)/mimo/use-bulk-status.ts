'use client'

import { useCallback, useEffect, useState } from 'react'
import { BULK_MOVING, type BulkStatusResponse } from '@/lib/chat-options'

const POLL_MS = 4000

/**
 * Where a bulk card's posts stand. Fetches once, then every few seconds while the worker is still moving one of them
 * and the tab is visible; coming back to the tab checks again. `refresh` fetches now, e.g. right after an approval.
 * Without posts (a plan not started yet) it fetches once, for the plan's credits that cost shares are shown against.
 */
export function useBulkStatus(postIds: string[]): { data: BulkStatusResponse | null; error: boolean; refresh: () => void } {
  const key = postIds.join(',')
  const [data, setData] = useState<BulkStatusResponse | null>(null)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams(key ? key.split(',').map((id) => ['id', id]) : [])
    let running = false
    let moving = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = moving && !controller.signal.aborted ? setTimeout(() => void load(), POLL_MS) : null
    }

    async function load() {
      if (running || controller.signal.aborted) return
      // A hidden tab waits; visibilitychange picks it up again.
      if (document.visibilityState !== 'visible') return
      running = true
      try {
        const response = await fetch(`/api/sigap/bulk?${query}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok || response.redirected) throw new Error(String(response.status))
        const next: BulkStatusResponse = await response.json()
        if (controller.signal.aborted) return
        moving = next.items.some((item) => BULK_MOVING.has(item.stage))
        setData(next)
        setError(false)
      } catch {
        if (controller.signal.aborted) return
        // Stop on an error; the card offers a retry.
        moving = false
        setError(true)
      } finally {
        running = false
        schedule()
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    void load()
    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [key, nonce])

  const refresh = useCallback(() => setNonce((value) => value + 1), [])
  return { data, error, refresh }
}
