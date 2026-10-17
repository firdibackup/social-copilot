import { connection } from 'next/server'
import { requireActiveUser } from '@/lib/auth'
import { getBrandKit } from '@/lib/brand'
import { getConnectedAccountId, getConnection } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { Avatar } from './avatar'

async function loadWorkspace(): Promise<{ name: string; logoUrl: string | null }> {
  await connection()
  const userId = await requireActiveUser()
  try {
    const [accountId, instagram] = await Promise.all([getConnectedAccountId(userId), getConnection(userId)])
    // The brand belongs to the connected account; without one there is no brand to show.
    const kit = accountId ? await getBrandKit(userId, accountId) : null
    return { name: kit?.name || (instagram ? `@${instagram.username}` : 'Workspace'), logoUrl: kit?.logoUrl ?? null }
  } catch (error) {
    console.error('[sidebar] workspace gagal dimuat:', describeError(error))
    return { name: 'Workspace', logoUrl: null }
  }
}

/** The top of the sidebar: the brand's logo and name, else the Instagram account. */
export async function WorkspaceBadge() {
  const workspace = await loadWorkspace()
  return <WorkspaceLine {...workspace} />
}

export function WorkspaceLine({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <Avatar src={logoUrl} name={name} />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-ink">{name}</p>
        <p className="text-[11px] tracking-wide text-ink-muted uppercase">Workspace</p>
      </div>
    </div>
  )
}
