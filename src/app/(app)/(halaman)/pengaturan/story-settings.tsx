import { getTranslations } from 'next-intl/server'
import { Notice } from '@/components/notice'
import { requireUser } from '@/lib/auth'
import { getConnectedAccountId } from '@/lib/connection'
import { ConfigError, describeError } from '@/lib/errors'
import { getStoryDefault } from '@/lib/post-stories'
import { StoryToggle } from './story-toggle'

/** Selalu bagikan ke Story: the account's default for new Instagram posts; every post can still switch it. */
export async function StorySettings() {
  const t = await getTranslations('settings')
  const userId = await requireUser()
  let state: { accountId: string | null; enabled: boolean }
  try {
    const accountId = await getConnectedAccountId(userId)
    state = { accountId, enabled: accountId ? await getStoryDefault(userId, accountId) : false }
  } catch (error) {
    console.error('[pengaturan] Story gagal dimuat:', describeError(error))
    return <Notice tone="warning">{error instanceof ConfigError ? t('loadErrors.configuration', { message: error.message }) : t('loadErrors.database')}</Notice>
  }

  return (
    <section id="story" aria-labelledby="story-heading" className="rounded-xl border border-zinc-200 bg-white p-6">
      <StoryToggle initialEnabled={state.enabled} connected={state.accountId !== null} />
    </section>
  )
}
