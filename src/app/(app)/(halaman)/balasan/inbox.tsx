import { PendingLink } from './pending-link'
import { ProfileAvatar } from '@/components/profile-avatar'
import { listAutoDmConversationIds } from '@/lib/auto-dm'
import { getBrandKit } from '@/lib/brand'
import type { Connection } from '@/lib/connection'
import {
  getConversation,
  isReplyWindowOpen,
  listConversations,
  listMessages,
  type Conversation,
  type DmMessage,
} from '@/lib/dm'
import { describeError } from '@/lib/errors'
import { formatListTime, formatShortDateTime } from '@/lib/format'
import { conversationName, isConversationUnread } from '@/lib/inbox-rules'
import { profilesToRead } from '@/lib/inbox-sync'
import { MarkConversationSeen, SyncProfiles } from './controls'
import { ReplyBox } from './reply-box'
import { ScrollToEnd } from './scroll-to-end'

export type Filter = 'belum' | 'semua'
/** The DM tab also filters on conversations Auto DM talked in. */
export type DmFilter = Filter | 'otomatis'

export interface Brand {
  name: string
  logoUrl: string | null
}

/** The brand name and logo replies go out under. A brand kit that fails to load falls back to the username. */
export async function loadBrand(userId: string, accountId: string, instagram: Connection | null): Promise<Brand> {
  const kit = await getBrandKit(userId, accountId).catch((error: unknown) => {
    console.error('[balasan] brand gagal dimuat:', describeError(error))
    return null
  })
  return { name: kit?.name || (instagram ? `@${instagram.username}` : 'Brand'), logoUrl: kit?.logoUrl ?? null }
}

interface Thread {
  conversation: Conversation
  messages: DmMessage[]
  windowOpen: boolean
}

export function dmHref(filter: DmFilter, igsid?: string): string {
  const params = new URLSearchParams()
  if (filter !== 'belum') params.set('filter', filter)
  if (igsid) params.set('c', igsid)
  const query = params.toString()
  return query ? `/balasan?${query}` : '/balasan'
}

async function loadThread(userId: string, accountId: string, igsid: string, now: Date): Promise<Thread | null> {
  const [conversation, messages] = await Promise.all([
    getConversation(userId, accountId, igsid),
    listMessages(userId, igsid),
  ])
  if (!conversation) return null

  return { conversation, messages, windowOpen: isReplyWindowOpen(conversation, now) }
}

interface InboxData {
  conversations: Conversation[]
  thread: Thread | null
}

/** The DM list and the open thread. Throws on a database error; the page shows the notice. */
export async function loadInbox(
  userId: string,
  accountId: string,
  filter: DmFilter,
  selectedId: string | undefined,
  now: Date,
): Promise<InboxData> {
  const [listed, loadedThread] = await Promise.all([
    filter === 'otomatis'
      ? listAutoDmConversationIds(userId, accountId).then((ids) => listConversations(userId, accountId, false, ids))
      : listConversations(userId, accountId, filter === 'belum'),
    selectedId ? loadThread(userId, accountId, selectedId, now) : null,
  ])
  return { conversations: listed, thread: loadedThread }
}

const EMPTY_LIST: Record<DmFilter, { title?: string; text: string }> = {
  belum: { text: 'Tidak ada DM yang menunggu balasan.' },
  semua: { text: 'Belum ada DM masuk.' },
  otomatis: { title: 'Belum ada DM', text: 'Nggak ada percakapan yang cocok sama filter ini.' },
}

interface InboxProps extends InboxData {
  filter: DmFilter
  selectedId: string | undefined
  brand: Brand
  now: Date
}

export function Inbox({ conversations, thread, filter, selectedId, brand, now }: InboxProps) {
  // The open conversation stays in the list after it is answered, so "Belum dibales" doesn't swallow it.
  const list =
    thread && !conversations.some((conversation) => conversation.igsid === thread.conversation.igsid)
      ? [thread.conversation, ...conversations]
      : conversations
  const candidates = thread
    ? [thread.conversation, ...list.filter((conversation) => conversation.igsid !== thread.conversation.igsid)]
    : list
  const staleProfiles = profilesToRead(candidates, now).map((conversation) => conversation.igsid)

  return (
    <section aria-label="DM" className="space-y-3">
      <SyncProfiles igsids={staleProfiles} />
      {selectedId && !thread && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Percakapan tidak ditemukan.
        </p>
      )}
      {list.length === 0 ? (
        <div className="space-y-1 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          {EMPTY_LIST[filter].title && <p className="font-medium text-zinc-900">{EMPTY_LIST[filter].title}</p>}
          <p>{EMPTY_LIST[filter].text}</p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {list.map((conversation) => {
            const isOpen = thread?.conversation.igsid === conversation.igsid
            return (
              <li key={conversation.igsid}>
                <ConversationRow
                  conversation={conversation}
                  href={dmHref(filter, isOpen ? undefined : conversation.igsid)}
                  isOpen={isOpen}
                  now={now}
                />
                {isOpen && thread && <ThreadView thread={thread} brand={brand} />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

interface ConversationRowProps {
  conversation: Conversation
  href: string
  isOpen: boolean
  now: Date
}

function ConversationRow({ conversation, href, isOpen, now }: ConversationRowProps) {
  const name = conversationName(conversation)
  // Opening the thread marks it read; until the next load the row still says it was unread.
  const unread = !isOpen && isConversationUnread(conversation)
  return (
    <PendingLink
      href={href}
      scroll={false}
      aria-expanded={isOpen}
      className={`flex items-center gap-3 px-4 py-3 ${isOpen ? 'bg-zinc-50' : 'hover:bg-zinc-50'}`}
    >
      <ProfileAvatar src={conversation.profilePicUrl} name={name} />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-2">
          <span className={`truncate text-sm text-zinc-900 ${unread ? 'font-semibold' : 'font-medium'}`}>{name}</span>
          {unread && <span className="size-2 shrink-0 rounded-full bg-blue-500" aria-label="Belum dibaca" />}
        </span>
        <span className={`block truncate text-sm ${unread ? 'text-zinc-800' : 'text-zinc-500'}`}>
          {!conversation.lastFromCustomer && 'Kamu: '}
          {conversation.lastText ?? '(lampiran)'}
        </span>
      </span>
      <time dateTime={conversation.lastMessageAt.toISOString()} className="shrink-0 self-start text-xs text-zinc-500">
        {formatListTime(conversation.lastMessageAt, now)}
      </time>
    </PendingLink>
  )
}

function ThreadView({ thread, brand }: { thread: Thread; brand: Brand }) {
  const { conversation, messages } = thread
  const name = conversationName(conversation)
  return (
    <div className="space-y-4 border-t border-zinc-100 bg-zinc-50 px-3 py-4 sm:px-5">
      <MarkConversationSeen igsid={conversation.igsid} />
      <div className="flex items-center gap-3">
        <ProfileAvatar src={conversation.profilePicUrl} name={name} className="size-11" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900">{conversation.name ?? name}</p>
          {conversation.username && <p className="truncate text-xs text-zinc-500">@{conversation.username}</p>}
        </div>
      </div>
      <ScrollToEnd count={messages.length} className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
        {messages.map((message) => (
          <li
            key={message.mid}
            className={`flex items-end gap-2 ${message.fromCustomer ? 'justify-start' : 'justify-end'}`}
          >
            {message.fromCustomer && <ProfileAvatar src={conversation.profilePicUrl} name={name} className="size-7" />}
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${
                message.fromCustomer
                  ? 'rounded-bl-md border border-zinc-200 bg-white text-zinc-900'
                  : 'rounded-br-md bg-accent text-white'
              }`}
            >
              <p className={message.text === null ? 'italic opacity-70' : undefined}>{message.text ?? '(lampiran)'}</p>
              <time dateTime={message.sentAt.toISOString()} className="mt-1 block text-[11px] opacity-60">
                {formatShortDateTime(message.sentAt)}
              </time>
            </div>
          </li>
        ))}
      </ScrollToEnd>
      <ReplyBox
        key={conversation.igsid}
        igsid={conversation.igsid}
        windowOpen={thread.windowOpen}
        brand={brand}
      />
    </div>
  )
}
