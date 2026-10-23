'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { sigapKeys } from './sigap-query'

const Scope = createContext<{ scope: string; isCurrent: () => boolean }>({ scope: '', isCurrent: () => false })
export const useSigapScope = () => useContext(Scope)

export function SigapProvider({ scope, revision, children }: { scope: string; revision: number; children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  const seen = useRef(revision)
  const active = useRef(true)
  const [context] = useState(() => ({ scope, isCurrent: () => active.current }))
  useEffect(() => {
    if (seen.current === revision) return
    seen.current = revision
    // Bridge existing Server Action refreshes (confirmation, bulk, scheduling) into the data cache.
    void client.invalidateQueries({ queryKey: sigapKeys.all(scope) })
  }, [client, scope, revision])
  useEffect(() => {
    active.current = true
    const clear = (event: SubmitEvent) => {
      const form = event.target
      if (form instanceof HTMLFormElement && form.querySelector('[aria-label="Keluar"]')) {
        active.current = false
        client.clear()
      }
    }
    document.addEventListener('submit', clear, true)
    return () => {
      active.current = false
      void client.cancelQueries()
      document.removeEventListener('submit', clear, true)
      // Activity hides routes by cleaning up effects. Retain data for its next reveal.
      void client.invalidateQueries({ queryKey: sigapKeys.all(scope), refetchType: 'none' })
    }
  }, [client, scope])
  return <QueryClientProvider client={client}><Scope value={context}>{children}</Scope></QueryClientProvider>
}
