import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { env } from './env'

export interface SessionUser {
  id: string
  email: string
}

/**
 * Supabase Auth with the visitor's session cookies. Only for signing in and out and reading the session:
 * data still goes through db() (service role), filtered by the user's id.
 */
export async function authClient() {
  const store = await cookies()
  return createServerClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // Server Components can't set cookies; proxy.ts has already refreshed the session for them.
        }
      },
    },
  })
}

/** The signed-in user, or null. getClaims verifies the token; getSession would trust the cookie as it is. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const { data } = await (await authClient()).auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' }
})

/** The signed-in user's id. Every page and server action that touches data calls this, not only proxy.ts. */
export async function requireUser(): Promise<string> {
  const user = await currentUser()
  if (!user) redirect('/masuk')
  return user.id
}
