import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { cache } from 'react'
import { getCurrentPeriod, type Period } from './billing'
import { getConnectedAccountId } from './connection'
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
  // Checking the token's expiry reads the clock, which Cache Components refuse during a prerender.
  await connection()
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

/** The current period of the signed-in user, or null. Cached per request like the session. */
export const currentPeriod = cache(async (userId: string): Promise<Period | null> => getCurrentPeriod(userId))

/**
 * The signed-in user's id, for everything behind the subscription: the app pages, their actions and the OAuth
 * routes. Without a paid period covering now, the user goes to /langganan.
 */
export async function requireActiveUser(): Promise<string> {
  const userId = await requireUser()
  if (!(await currentPeriod(userId))) redirect('/langganan')
  return userId
}

/** The signed-in user and the Instagram account whose data the dashboard shows. */
export interface AccountScope {
  userId: string
  accountId: string
}

/**
 * For the pages that show one account's data (Brand, Buat, Kalender, Aset, Balasan), their actions and routes.
 * Without a connected Instagram account the user goes to Pengaturan to connect one.
 */
export const requireAccount = cache(async (): Promise<AccountScope> => {
  const userId = await requireActiveUser()
  const accountId = await getConnectedAccountId(userId)
  if (!accountId) redirect('/pengaturan?perlu=instagram')
  return { userId, accountId }
})
