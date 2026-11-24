import 'server-only'
import type { AccountScope } from './auth'
import { listProductGroups } from './assets'
import { listReferenceOptions } from './brand'
import { getSession, listMessages, researchLimit } from './chat'
import { getActiveChatJob } from './chat-jobs'
import { getDensityDefault } from './density'

export async function loadMimoConversation({ userId, accountId }: AccountScope, id: string) {
  const session = await getSession(userId, accountId, id)
  // Check account ownership before reading messages, which are scoped by user and session.
  if (!session) return { session: null, messages: [], activeJob: null }
  // The answer Mimo is still working on, if any: the chat follows it again after a reload (chat-jobs.ts).
  const [messages, activeJob] = await Promise.all([listMessages(userId, session.id), getActiveChatJob(userId, session.id)])
  return { session: { id: session.id }, messages, activeJob }
}

export async function loadMimoSupport({ userId, accountId }: AccountScope) {
  const [products, defaultDensity, references, researchDaily] = await Promise.all([
    listProductGroups(userId, accountId),
    getDensityDefault(userId, accountId),
    listReferenceOptions(userId, accountId),
    researchLimit(userId),
  ])
  return {
    products: products.map(({ id, title, imageCount }) => ({ id, label: title, imageCount })),
    defaultDensity,
    references,
    /** Intel Kompetitor runs per day; 0 locks the switch. */
    researchDaily,
  }
}
