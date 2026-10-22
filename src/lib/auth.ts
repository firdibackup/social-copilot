import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { cache } from 'react'
import { parseAdminEmails } from './admin-options'
import { getCurrentPeriod, type Period } from './billing'
import { getConnectedAccountId } from './connection'
import { env } from './env'
import { describeError } from './errors'
import { isOnboarded } from './onboarding'

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

/** Whether the user is one of ADMIN_EMAILS. Admins need no subscription for the admin pages. */
export const isAdmin = (user: SessionUser) =>
  user.email !== '' && parseAdminEmails(process.env.ADMIN_EMAILS).has(user.email.toLowerCase())

/**
 * The signed-in admin, for every admin page, action and route. Anyone else gets a 404, so the pages don't announce
 * that they exist.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) redirect('/masuk')
  if (!isAdmin(user)) notFound()
  return user
}

/** The current period of the signed-in user, or null. Cached per request like the session. */
export const currentPeriod = cache(async (userId: string): Promise<Period | null> => getCurrentPeriod(userId))

/**
 * Whether the user finished the onboarding wizard. Cached per request. A database error lets the user through:
 * the wizard only seeds the brand, and the app must not lock everyone out over it.
 */
export const currentOnboarded = cache(async (userId: string): Promise<boolean> =>
  isOnboarded(userId).catch((error: unknown) => {
    console.error('[auth] status onboarding tidak terbaca:', describeError(error))
    return true
  }),
)

/**
 * The signed-in user's id, for everything behind the subscription: the app pages, their actions and the OAuth
 * routes. Without a paid period covering now, the user goes to /langganan; after paying, to the onboarding wizard
 * at /mulai until it is finished or skipped.
 */
export async function requireActiveUser(): Promise<string> {
  const userId = await requireUser()
  const [period, onboarded] = await Promise.all([currentPeriod(userId), currentOnboarded(userId)])
  if (!period) redirect('/langganan')
  if (!onboarded) redirect('/mulai')
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
