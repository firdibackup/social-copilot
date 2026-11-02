import 'server-only'
import type { SessionUser } from './auth'
import { db, unwrap } from './supabase'

/** Whether `typed` is the account's email, ignoring case and surrounding spaces. An account without one never matches. */
export function confirmsEmail(typed: string, email: string): boolean {
  const expected = email.trim().toLowerCase()
  return expected !== '' && typed.trim().toLowerCase() === expected
}

/**
 * Hapus akun: archives the account instead of deleting it. archive_account stops its queued work, frees its
 * Instagram and Threads accounts and records the archive; the Auth soft delete then frees the email and Google
 * identity while every row stays, so signing in again makes a new, empty account. Both steps are safe to repeat,
 * so a failure in the second is fixed by trying again.
 */
export async function archiveAccount(user: SessionUser): Promise<void> {
  unwrap(await db().rpc('archive_account', { p_user_id: user.id, p_email: user.email }))
  const { error } = await db().auth.admin.deleteUser(user.id, true)
  if (error) throw new Error(`Supabase Auth: ${error.message}`)
}
