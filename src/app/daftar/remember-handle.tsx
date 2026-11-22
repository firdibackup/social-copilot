'use client'

import { useEffect } from 'react'
import { HANDLE_STORAGE_KEY } from '../mulai/handle'

/**
 * Keeps the Instagram username typed on the landing page (/daftar?instagram=…) across the sign-up, Google's
 * redirect included, so the onboarding's first step starts with it.
 */
export function RememberHandle() {
  useEffect(() => {
    const handle = new URLSearchParams(window.location.search).get('instagram')?.replace(/^@+/, '').trim()
    if (!handle || handle.length > 60) return
    try {
      window.localStorage.setItem(HANDLE_STORAGE_KEY, handle)
    } catch {
      // Storage is blocked: the user types it again.
    }
  }, [])
  return null
}
