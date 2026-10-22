'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { editorKeys } from './editor-query'

const Scope = createContext('')
export const useEditorScope = () => useContext(Scope)

/** An instance per mounted authenticated workspace, never a server/global singleton. */
export function EditorProvider({ scope, revision, children }: { scope: string; revision: number; children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  const seen = useRef(revision)
  // Existing server actions use refresh/revalidatePath. Bridge that signal into the browser data cache.
  useEffect(() => {
    if (seen.current === revision) return
    seen.current = revision
    void client.invalidateQueries({ queryKey: editorKeys.all(scope) })
  }, [client, scope, revision])
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
