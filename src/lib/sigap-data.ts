import 'server-only'
import type { AccountScope } from './auth'
import { listProductGroups } from './assets'
import { getSession, listMessages } from './chat'
import { getDensityDefault } from './density'

export async function loadSigapConversation({ userId, accountId }: AccountScope, id: string) {
  const session = await getSession(userId, accountId, id)
  // Check account ownership before reading messages, which are scoped by user and session.
  return { session: session ? { id: session.id } : null, messages: session ? await listMessages(userId, session.id) : [] }
}

export async function loadSigapSupport({ userId, accountId }: AccountScope) {
  const [products, defaultDensity] = await Promise.all([
    listProductGroups(userId, accountId),
    getDensityDefault(userId, accountId),
  ])
  return { products: products.map(({ id, title, imageCount }) => ({ id, label: title, imageCount })), defaultDensity }
}
