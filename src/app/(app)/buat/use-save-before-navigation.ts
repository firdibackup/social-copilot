'use client'

import { useEffect, useEffectEvent } from 'react'

const SAVE_BEFORE_NAVIGATION = 'buat:save-before-navigation'
type SaveRequest = CustomEvent<{ saves: Promise<boolean>[] }>

/** All mounted editors participate, including the script and the Threads chain. */
export function useSaveBeforeNavigation(save: () => Promise<boolean>) {
  const flush = useEffectEvent(save)
  useEffect(() => {
    const handler = (event: Event) => { (event as SaveRequest).detail.saves.push(flush()) }
    window.addEventListener(SAVE_BEFORE_NAVIGATION, handler)
    return () => window.removeEventListener(SAVE_BEFORE_NAVIGATION, handler)
  }, [])
}

export async function saveBeforeNavigation(): Promise<boolean> {
  const detail = { saves: [] as Promise<boolean>[] }
  window.dispatchEvent(new CustomEvent(SAVE_BEFORE_NAVIGATION, { detail }))
  return (await Promise.all(detail.saves.map((save) => save.catch(() => false)))).every(Boolean)
}
