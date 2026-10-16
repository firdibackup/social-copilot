import { currentUser } from '@/lib/auth'

/** The signed-in user's email for the sidebar; proxy.ts has already sent visitors without a session away. */
export async function AccountEmail() {
  const user = await currentUser()
  return <span className="block truncate text-xs text-zinc-500">{user?.email}</span>
}
