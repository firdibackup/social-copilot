import { downloadMedia, removeMediaFile, signMediaUrls, uploadMediaFile } from '@/lib/assets'
import { getCurrentPeriod } from '@/lib/billing'
import { getPublishingAccount, markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { createContainer, getContainerStatus, InstagramApiError, publishContainer } from '@/lib/instagram'
import { setStoryContainer, settleStory, type ClaimedStory, type StorySettlement } from '@/lib/post-stories'
import { getMediaPaths } from '@/lib/posts'
import { renderStory } from '@/lib/story-image'

export const STORY_MAX_ATTEMPTS = 3
export const STORY_RETRY_DELAYS_MINUTES = [1, 5]
/** A Story long after its post no longer announces anything new. */
export const STORY_LATE_LIMIT_MS = 2 * 60 * 60 * 1000

const RECONNECT_MESSAGE = 'Sambungkan ulang Instagram di Pengaturan, lalu pilih Coba lagi.'
const LATE_MESSAGE = 'Terlewat lebih dari 2 jam setelah post terbit. Pilih Coba lagi untuk membagikannya sekarang.'
const PROCESSING_MESSAGE = 'Instagram masih memproses Story.'
const EXPIRED_MESSAGE = 'Langganan berakhir. Perpanjang di halaman Langganan, lalu pilih Coba lagi.'
const OTHER_ACCOUNT_MESSAGE = 'Akun Instagram berbeda'

/** The Story certainly did not go out and should not be retried. */
class StoryFailed extends Error {
  constructor(
    message: string,
    readonly clearContainer: boolean,
  ) {
    super(message)
  }
}

/** Worth another attempt; any container stays, since it may still publish. */
class RetryLater extends Error {}

/** Where the rendered Story waits for Instagram to fetch it; under the owner's folder so deleting them clears it. */
export const storyPath = (story: Pick<ClaimedStory, 'userId' | 'postId'>) => `${story.userId}/stories/${story.postId}.jpg`

async function createStoryContainer(accessToken: string, instagramUserId: string, username: string, story: ClaimedStory) {
  const [cover] = await getMediaPaths(story.postId)
  if (!cover) throw new StoryFailed('Post tidak punya foto untuk Story.', false)
  const image = await renderStory(await downloadMedia(cover), username)
  const path = storyPath(story)
  await uploadMediaFile(path, image)
  const [url] = await signMediaUrls([path])
  return createContainer(accessToken, instagramUserId, { media_type: 'STORIES', image_url: url })
}

/** Returns the Story's media id, or null when only the container status proved it went out. */
async function publish(story: ClaimedStory, now: Date): Promise<string | null> {
  if (story.attemptCount === 1 && now.getTime() - story.dueAt.getTime() > STORY_LATE_LIMIT_MS) {
    throw new StoryFailed(LATE_MESSAGE, false)
  }
  if (!(await getCurrentPeriod(story.userId, now))) throw new StoryFailed(EXPIRED_MESSAGE, false)
  const { accessToken, instagramUserId, username } = await getPublishingAccount(story.userId)
  if (story.accountId !== instagramUserId) throw new StoryFailed(OTHER_ACCOUNT_MESSAGE, false)

  let containerId = story.containerId
  if (containerId) {
    const status = await getContainerStatus(accessToken, containerId)
    if (status === 'PUBLISHED') return null
    if (status === 'IN_PROGRESS') throw new RetryLater(PROCESSING_MESSAGE)
    if (status === 'ERROR' || status === 'EXPIRED') {
      await setStoryContainer(story.postId, null)
      containerId = null
    }
  }

  if (!containerId) {
    containerId = await createStoryContainer(accessToken, instagramUserId, username, story)
    // Saved before publishing, so a crash or timeout from here on is caught by the check above.
    await setStoryContainer(story.postId, containerId)
    const status = await getContainerStatus(accessToken, containerId)
    if (status === 'IN_PROGRESS') throw new RetryLater(PROCESSING_MESSAGE)
    if (status !== 'FINISHED') throw new StoryFailed(`Instagram gagal memproses Story (${status}).`, true)
  }

  return publishContainer(accessToken, instagramUserId, containerId)
}

const failed = (error: string, clearContainer: boolean): StorySettlement => ({
  status: 'failed',
  error,
  nextAttemptAt: null,
  mediaId: null,
  clearContainer,
})

async function settlementFor(story: ClaimedStory, error: unknown, now: Date): Promise<StorySettlement> {
  console.error(`[worker] Story post ${story.postId} percobaan ${story.attemptCount} gagal:`, describeError(error))

  if (error instanceof StoryFailed) return failed(error.message, error.clearContainer)
  if (error instanceof NeedsReconnectError) return failed(RECONNECT_MESSAGE, false)
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markNeedsReconnect(story.userId)
    return failed(RECONNECT_MESSAGE, false)
  }
  if (error instanceof InstagramApiError && !error.isTransient) {
    return failed(`Instagram menolak Story: ${error.message}`, true)
  }

  const message = error instanceof Error ? error.message : 'Kesalahan tidak dikenal'
  if (story.attemptCount >= STORY_MAX_ATTEMPTS) return failed(message, false)
  const delayMinutes = STORY_RETRY_DELAYS_MINUTES[story.attemptCount - 1] ?? STORY_RETRY_DELAYS_MINUTES.at(-1)!
  return {
    status: 'pending',
    error: message,
    nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000),
    mediaId: null,
    clearContainer: false,
  }
}

/**
 * One attempt at a claimed Story: the post's first slide, rendered 9:16, published to the account's Story. A failure
 * stays on the Story; the feed post is already out and keeps its status.
 */
export async function processStory(story: ClaimedStory, now = new Date()): Promise<void> {
  const settlement = await publish(story, now).then(
    (mediaId): StorySettlement => ({ status: 'published', error: null, nextAttemptAt: null, mediaId, clearContainer: false }),
    (error: unknown) => settlementFor(story, error, now),
  )
  await settleStory(story.postId, settlement)
  // Instagram fetched the image when it made the container; once out, the rendered copy is only storage.
  if (settlement.status === 'published') {
    await removeMediaFile(storyPath(story)).catch((error: unknown) => {
      console.error(`[worker] file Story post ${story.postId} tertinggal:`, describeError(error))
    })
  }
}
