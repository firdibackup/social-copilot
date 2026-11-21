import 'server-only'
import { db } from './supabase'
import type { HookTemplate } from './hook-guide'

/** ponytail: lexical retrieval for 19 curated structures; consider embeddings only after measured recall gaps. */
export async function retrieveHooks(query: string): Promise<{ templates: HookTemplate[]; source: 'supabase' | 'rules-only' }> {
  try {
    const { data, error } = await db().rpc('retrieve_hooks', { query_text: query.slice(0, 6000) }).abortSignal(AbortSignal.timeout(2000))
    if (error) throw error
    return { templates: (data ?? []) as HookTemplate[], source: 'supabase' }
  } catch {
    console.warn('[hooks] retrieval unavailable; continuing with general rules only')
    return { templates: [], source: 'rules-only' }
  }
}
