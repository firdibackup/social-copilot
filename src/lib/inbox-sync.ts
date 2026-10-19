import 'server-only'
import {
  claimDmSync,
  claimWebhookSubscription,
  getPublishingAccount,
  getValidAccessToken,
  markNeedsReconnect,
  markWebhooksSubscribed,
  NeedsReconnectError,
  releaseDmSync,
} from './connection'
import { listStoredMids, markProfileTried, recordMessage, saveProfile, type Conversation } from './dm'
import type { MessageEvent } from './dm-webhook'
import { describeError } from './errors'
import { isProfileStale } from './inbox-rules'
import {
  fetchCustomerProfile,
  InstagramApiError,
  listInstagramConversations,
  subscribeToWebhooks,
  type InstagramConversation,
} from './instagram'
import { mapLimit } from './map-limit'

const SUBSCRIBE_RETRY_MS = 60 * 60 * 1000
/** Profiles read per inbox load, a few at a time, so a large old inbox fills over a few visits. */
export const PROFILE_BATCH = 12
const PROFILE_CONCURRENCY = 4
/** Opening the DM tab or Muat ulang reads Instagram's conversations again only this long after the last pull. */
const DM_SYNC_COOLDOWN_MS = 10 * 60 * 1000
// ponytail: the 100 newest conversations, as many as the inbox lists; page further when inboxes outgrow it.
const MAX_CONVERSATIONS = 100
const IMPORT_CONCURRENCY = 4
const SECOND_MS = 1000

export async function ensureWebhookSubscription(userId: string): Promise<void> {
  try {
    const scopes = await claimWebhookSubscription(userId, SUBSCRIBE_RETRY_MS)
    if (!scopes) return
    await subscribeToWebhooks(await getValidAccessToken(userId), scopes)
    await markWebhooksSubscribed(userId)
  } catch (error) {
    if (error instanceof NeedsReconnectError) return
    if (error instanceof InstagramApiError && error.isInvalidToken) {
      await markNeedsReconnect(userId).catch(() => {})
      return
    }
    console.error('[balasan] langganan webhook gagal:', describeError(error))
  }
}

/** The conversations whose customer profile was never read, or was read over 3 days ago. */
export function profilesToRead(conversations: readonly Conversation[], now: Date): Conversation[] {
  return conversations.filter((conversation) => isProfileStale(conversation.profileFetchedAt, now)).slice(0, PROFILE_BATCH)
}

/**
 * Reads the profiles of `conversations` from Instagram and stores them. Returns the conversations with what was read,
 * so the page shows them right away. A profile Instagram refuses waits 3 days; the rest of the batch goes on.
 */
export async function readProfiles(userId: string, conversations: readonly Conversation[]): Promise<Conversation[]> {
  if (conversations.length === 0) return []
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(userId)
  } catch (error) {
    if (!(error instanceof NeedsReconnectError)) console.error('[balasan] token untuk profil gagal:', describeError(error))
    return []
  }
  const results = await mapLimit(conversations, PROFILE_CONCURRENCY, async (conversation) => {
    try {
      const profile = await fetchCustomerProfile(accessToken, conversation.igsid)
      await saveProfile(userId, conversation.igsid, profile)
      return {
        ...conversation,
        // A private reply's conversation keeps the username from the comment when Instagram gives none.
        username: profile.username ?? conversation.username,
        name: profile.name ?? conversation.name,
        profilePicUrl: profile.profilePicUrl,
        profileFetchedAt: new Date(),
      }
    } catch (error) {
      if (error instanceof InstagramApiError && error.isInvalidToken) await markNeedsReconnect(userId).catch(() => {})
      else console.error('[balasan] profil pelanggan gagal diambil:', describeError(error))
      await markProfileTried(userId, conversation.igsid).catch(() => {})
      return null
    }
  })
  return results.filter((conversation) => conversation !== null)
}

/** The messages of `remote` not stored yet, oldest first, the order they were sent. */
export function newMessages(remote: readonly InstagramConversation[], storedMids: ReadonlySet<string>): MessageEvent[] {
  return remote
    .flatMap((conversation) => conversation.messages)
    .filter((message) => !storedMids.has(message.mid))
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
}

export interface DmSyncResult {
  /** Messages that weren't stored yet. */
  messages: number
}

/**
 * Stores the DMs Instagram has that the webhook never brought: chats from before the account was connected, or
 * while the webhook was off. Messages are keyed on `mid`, so a repeat stores nothing twice. Answers 'cooldown' when
 * a pull started less than 10 minutes ago; a failed pull frees its claim.
 */
export async function syncConversations(userId: string): Promise<DmSyncResult | 'cooldown'> {
  if (!(await claimDmSync(userId, DM_SYNC_COOLDOWN_MS))) return 'cooldown'
  try {
    const account = await getPublishingAccount(userId)
    const remote = await listInstagramConversations(account.accessToken, account.instagramUserId, MAX_CONVERSATIONS)
    const sent = remote.flatMap((conversation) => conversation.messages.map((message) => message.sentAt.getTime()))
    if (sent.length === 0) return { messages: 0 }
    // Instagram's times drop the milliseconds the webhook keeps, so a stored copy is never older than this.
    const since = new Date(Math.min(...sent) - SECOND_MS)
    const storedMids = await listStoredMids(userId, remote.map((conversation) => conversation.igsid), since)
    const added = await mapLimit(newMessages(remote, storedMids), IMPORT_CONCURRENCY, (message) =>
      recordMessage(userId, message),
    )
    return { messages: added.filter(Boolean).length }
  } catch (error) {
    await releaseDmSync(userId).catch((releaseError: unknown) =>
      console.error('[balasan] klaim tarik DM gagal dilepas:', describeError(releaseError)),
    )
    throw error
  }
}
