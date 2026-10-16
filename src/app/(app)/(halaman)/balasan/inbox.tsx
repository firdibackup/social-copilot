import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'
import { Notice } from '@/components/notice'
import { requireActiveUser } from '@/lib/auth'
import { getConnection } from '@/lib/connection'
import {
  getConversation,
  getVariables,
  isReplyWindowOpen,
  listConversations,
  listMessages,
  listTemplates,
  type Conversation,
  type DmMessage,
} from '@/lib/dm'
import { fillTemplate, suggestTemplate } from '@/lib/dm-templates'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { formatDateTime, formatShortDate, formatTime, wibDateKey } from '@/lib/format'
import { firstValue, type SearchParams } from '@/lib/params'
import { SubscribeButton } from './controls'
import { ReplyBox, type Suggestion, type TemplateOption } from './reply-box'

type Filter = 'belum' | 'semua'

interface Thread {
  conversation: Conversation
  messages: DmMessage[]
  options: TemplateOption[]
  suggestion: Suggestion | null
  windowOpen: boolean
}

const LABEL_MAX_LENGTH = 40

function inboxHref(filter: Filter, igsid?: string): string {
  const params = new URLSearchParams()
  if (filter === 'semua') params.set('filter', 'semua')
  if (igsid) params.set('c', igsid)
  const query = params.toString()
  return query ? `/balasan?${query}` : '/balasan'
}

const displayName = (conversation: Conversation) =>
  conversation.name ?? (conversation.username ? `@${conversation.username}` : 'Pengguna Instagram')

function shorten(value: string): string {
  const line = value.split('\n', 1)[0]
  return line.length > LABEL_MAX_LENGTH ? `${line.slice(0, LABEL_MAX_LENGTH - 1)}…` : line
}

/** Today's messages show the time; older ones the date. */
const listTime = (date: Date, now: Date) =>
  wibDateKey(date) === wibDateKey(now) ? formatTime(date) : formatShortDate(date)

async function loadThread(userId: string, igsid: string, now: Date): Promise<Thread | null> {
  const [conversation, messages, templates, variables] = await Promise.all([
    getConversation(userId, igsid),
    listMessages(userId, igsid),
    listTemplates(userId),
    getVariables(userId),
  ])
  if (!conversation) return null

  const customerMessage = messages.findLast((message) => message.fromCustomer)?.text ?? null
  const context = { senderName: conversation.name ?? conversation.username, message: customerMessage, variables }
  const options = templates.map((template) => ({
    id: template.id,
    label: template.keyword ?? shorten(template.body),
    text: fillTemplate(template.body, context),
  }))
  // Only a conversation that waits for a reply gets a draft; the owner already answered the others.
  const match = conversation.lastFromCustomer && customerMessage ? suggestTemplate(templates, customerMessage) : null
  const suggestion = match?.keyword ? { keyword: match.keyword, text: fillTemplate(match.body, context) } : null

  return { conversation, messages, options, suggestion, windowOpen: isReplyWindowOpen(conversation, now) }
}

export async function Inbox({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  await connection()
  const userId = await requireActiveUser()
  const now = new Date()
  const filter: Filter = firstValue(params.filter) === 'semua' ? 'semua' : 'belum'
  const selectedId = firstValue(params.c)

  let connected: boolean
  let conversations: Conversation[] = []
  let thread: Thread | null = null
  try {
    connected = (await getConnection(userId)) !== null
    if (connected) {
      ;[conversations, thread] = await Promise.all([
        listConversations(userId, filter === 'belum'),
        selectedId ? loadThread(userId, selectedId, now) : null,
      ])
    }
  } catch (error) {
    console.error('[balasan] gagal memuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  if (!connected) {
    return (
      <Notice tone="warning">
        Belum ada akun Instagram terhubung.{' '}
        <Link href="/pengaturan#instagram" className="font-medium underline">
          Hubungkan dulu di Pengaturan
        </Link>
        .
      </Notice>
    )
  }

  return (
    <section aria-label="Kotak masuk" className="space-y-3">
      <nav aria-label="Filter" className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm">
        <FilterLink href={inboxHref('belum', selectedId)} active={filter === 'belum'} label="Belum dibalas" />
        <FilterLink href={inboxHref('semua', selectedId)} active={filter === 'semua'} label="Semua" />
      </nav>

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className={selectedId ? 'hidden space-y-3 lg:block' : 'space-y-3'}>
          {conversations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
              {filter === 'belum' ? 'Tidak ada DM yang menunggu balasan.' : 'Belum ada DM masuk.'}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {conversations.map((conversation) => (
                <li key={conversation.igsid}>
                  <ConversationLink
                    conversation={conversation}
                    href={inboxHref(filter, conversation.igsid)}
                    active={conversation.igsid === selectedId}
                    now={now}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2 text-xs text-zinc-500">
            <p>DM baru tidak muncul? Aktifkan pengiriman DM untuk akun ini.</p>
            <SubscribeButton />
          </div>
        </div>

        <div className={selectedId ? '' : 'hidden lg:block'}>
          {selectedId ? (
            <>
              <Link
                href={inboxHref(filter)}
                className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 lg:hidden"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Semua percakapan
              </Link>
              {thread ? (
                <ThreadView thread={thread} />
              ) : (
                <Notice tone="warning">Percakapan tidak ditemukan.</Notice>
              )}
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              Pilih percakapan untuk membaca dan membalas.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-md px-3 py-1.5 ${active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'}`}
    >
      {label}
    </Link>
  )
}

interface ConversationLinkProps {
  conversation: Conversation
  href: string
  active: boolean
  now: Date
}

function ConversationLink({ conversation, href, active, now }: ConversationLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`block space-y-0.5 px-4 py-3 ${active ? 'bg-zinc-100' : 'hover:bg-zinc-50'}`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-zinc-900">{displayName(conversation)}</span>
        <time dateTime={conversation.lastMessageAt.toISOString()} className="shrink-0 text-xs text-zinc-500">
          {listTime(conversation.lastMessageAt, now)}
        </time>
      </span>
      <span className="flex items-center gap-2">
        {conversation.lastFromCustomer && (
          <span className="size-2 shrink-0 rounded-full bg-emerald-500" aria-label="Menunggu balasan" />
        )}
        <span className="truncate text-sm text-zinc-500">
          {!conversation.lastFromCustomer && 'Kamu: '}
          {conversation.lastText ?? '(lampiran)'}
        </span>
      </span>
    </Link>
  )
}

function ThreadView({ thread }: { thread: Thread }) {
  const { conversation, messages } = thread
  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-4 py-3">
        <h2 className="font-medium text-zinc-900">{displayName(conversation)}</h2>
        {conversation.username && conversation.name && (
          <p className="text-sm text-zinc-500">@{conversation.username}</p>
        )}
      </header>
      <ol className="max-h-[28rem] space-y-2 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <li key={message.mid} className={`flex ${message.fromCustomer ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${
                message.fromCustomer ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-white'
              }`}
            >
              <p className={message.text === null ? 'italic opacity-70' : undefined}>{message.text ?? '(lampiran)'}</p>
              <time dateTime={message.sentAt.toISOString()} className="mt-1 block text-[11px] opacity-60">
                {formatDateTime(message.sentAt)}
              </time>
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t border-zinc-100 p-4">
        <ReplyBox
          // A new customer message starts a fresh draft, with the template it matches.
          key={`${conversation.igsid}:${conversation.lastIncomingAt?.toISOString()}`}
          igsid={conversation.igsid}
          options={thread.options}
          suggestion={thread.suggestion}
          windowOpen={thread.windowOpen}
        />
      </div>
    </article>
  )
}
