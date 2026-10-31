import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getBrandKit } from '@/lib/brand'
import { getConnectedAccountId, getConnection } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { Avatar } from './avatar'

async function loadWorkspace(): Promise<{ name: string; logoUrl: string | null }> {
  await connection()
  const t = await getTranslations('shell')
  const userId = await requireUser()
  try {
    const [accountId, instagram] = await Promise.all([getConnectedAccountId(userId), getConnection(userId)])
    // The brand belongs to the connected account; without one there is no brand to show.
    const kit = accountId ? await getBrandKit(userId, accountId) : null
    return { name: kit?.name || (instagram ? `@${instagram.username}` : t('workspace')), logoUrl: kit?.logoUrl ?? null }
  } catch (error) {
    console.error('[sidebar] workspace gagal dimuat:', describeError(error))
    return { name: t('workspace'), logoUrl: null }
  }
}

/** The top of the sidebar: the brand's logo and name, else the Instagram account. */
export async function WorkspaceBadge() {
  const workspace = await loadWorkspace()
  return <WorkspaceLine {...workspace} />
}

export function WorkspaceLine({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const t = useTranslations('shell')
  return (
    <div className="flex items-center gap-3 rounded-xl px-1.5 py-1">
      <Avatar src={logoUrl} name={name} />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-ink">{name}</p>
        <p className="text-[12px] text-ink-muted">{t('workspace')}</p>
      </div>
    </div>
  )
}
