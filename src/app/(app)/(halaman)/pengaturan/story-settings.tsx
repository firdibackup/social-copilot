import { Notice } from '@/components/notice'
import { requireUser } from '@/lib/auth'
import { getConnectedAccountId } from '@/lib/connection'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { getStoryDefault } from '@/lib/post-stories'
import { StoryToggle } from './story-toggle'

/** Selalu bagikan ke Story: the account's default for new Instagram posts; every post can still switch it. */
export async function StorySettings() {
  const userId = await requireUser()
  let state: { accountId: string | null; enabled: boolean }
  try {
    const accountId = await getConnectedAccountId(userId)
    state = { accountId, enabled: accountId ? await getStoryDefault(userId, accountId) : false }
  } catch (error) {
    console.error('[pengaturan] Story gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  return (
    <section id="story" aria-labelledby="story-heading" className="rounded-xl border border-zinc-200 bg-white p-6">
      <StoryToggle initialEnabled={state.enabled} connected={state.accountId !== null} />
    </section>
  )
}
