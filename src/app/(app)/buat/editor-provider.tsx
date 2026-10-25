'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const Scope = createContext('')
export const useEditorScope = () => useContext(Scope)

/** An instance per mounted authenticated workspace, never a server/global singleton. */
export function EditorProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  useEffect(() => () => { client.clear() }, [client])
  useEffect(() => {
    // Auth redirects may have been prefetched, so clear sensitive query memory before logout submits.
    const clear = (event: SubmitEvent) => {
      const form = event.target
      if (form instanceof HTMLFormElement && form.querySelector('[aria-label="Keluar"]')) client.clear()
    }
    document.addEventListener('submit', clear, true)
    return () => document.removeEventListener('submit', clear, true)
  }, [client])
  return <QueryClientProvider client={client}><Scope value={scope}>{children}</Scope></QueryClientProvider>
}
