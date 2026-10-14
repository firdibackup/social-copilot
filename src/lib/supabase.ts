import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

let client: SupabaseClient | undefined

/**
 * Service-role client: bypasses RLS, so it must only ever run on the server.
 * Tables have RLS enabled with no policies, which locks out the publishable key.
 */
export function db(): SupabaseClient {
  client ??= createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

type Result<T> = { data: T; error: null } | { data: null; error: { message: string } }

/** Returns the data of a Supabase result, or throws its error as a plain Error. */
export function unwrap<T>(result: Result<T>): T {
  if (result.error) throw new Error(`Supabase: ${result.error.message}`)
  return result.data
}
