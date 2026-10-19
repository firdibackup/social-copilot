import 'server-only'
import { getCurrentPeriod } from './billing'
import { listNotificationComments, markAllCommentsSeen, setCommentReadState } from './comments'
import { getConnectedAccountId } from './connection'
import { listNotificationConversations, markAllConversationsSeen, setConversationReadState } from './dm'
import { summarizeNotifications, type Notification, type NotificationFeed } from './inbox-rules'

const INSTAGRAM_REQUIRED: NotificationFeed = { status: 'instagram_required', count: 0, items: [] }
const SUBSCRIPTION_REQUIRED: NotificationFeed = { status: 'subscription_required', count: 0, items: [] }

export async function getNotificationFeed(userId: string): Promise<NotificationFeed> {
  const [accountId, period] = await Promise.all([getConnectedAccountId(userId), getCurrentPeriod(userId)])
  if (!accountId) return INSTAGRAM_REQUIRED
  if (!period) return SUBSCRIPTION_REQUIRED
  const [conversations, comments] = await Promise.all([
    listNotificationConversations(userId, accountId),
    listNotificationComments(userId, accountId),
  ])
  return { status: 'active', ...summarizeNotifications(conversations, comments) }
}

export async function setNotificationReadState(
  userId: string,
  kind: Notification['kind'],
  id: string,
  read: boolean,
): Promise<void> {
  const accountId = await getConnectedAccountId(userId)
  if (!accountId) return
  if (kind === 'dm') await setConversationReadState(userId, accountId, id, read)
  else await setCommentReadState(userId, accountId, id, read)
}

export async function markAllNotificationsSeen(userId: string): Promise<void> {
  const accountId = await getConnectedAccountId(userId)
  if (!accountId) return
  await Promise.all([markAllConversationsSeen(userId, accountId), markAllCommentsSeen(userId, accountId)])
}
