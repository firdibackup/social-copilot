import 'server-only'
import type { AccountScope } from './auth'
import { listProductGroups } from './assets'
import { listReferenceOptions } from './brand'
import { getSession, listMessages } from './chat'
import { getDensityDefault } from './density'

export async function loadMimoConversation({ userId, accountId }: AccountScope, id: string) {
  const session = await getSession(userId, accountId, id)
  // Check account ownership before reading messages, which are scoped by user and session.
  return { session: session ? { id: session.id } : null, messages: session ? await listMessages(userId, session.id) : [] }
}

export async function loadMimoSupport({ userId, accountId }: AccountScope) {
  const [products, defaultDensity, references] = await Promise.all([
    listProductGroups(userId, accountId),
    getDensityDefault(userId, accountId),
    listReferenceOptions(userId, accountId),
  ])
  return {
    products: products.map(({ id, title, imageCount }) => ({ id, label: title, imageCount })),
    defaultDensity,
    references: references.map(({ id, label }) => ({ id, label })),
  }
}
