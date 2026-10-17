'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const INTERVAL_MS = 5000

/** Reloads the page's data every few seconds while the new-account fill runs, so its results appear by themselves. */
export function SyncRefresher() {
  const router = useRouter()
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [router])
  return null
}
