import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Plus } from 'lucide-react'
import { Notice } from '@/components/notice'
import { requireAccount } from '@/lib/auth'
import { latestRuns, listRules } from '@/lib/auto-dm'
import { getConnection, type Connection } from '@/lib/connection'
import { getVariables, listTemplates } from '@/lib/dm'
import { formatVariables, type DmTemplate } from '@/lib/dm-templates'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { COMMENTS_SCOPE } from '@/lib/instagram'
import { firstValue, type SearchParams } from '@/lib/params'
import { THREADS_REPLIES_SCOPE } from '@/lib/threads'
import { getThreadsConnection, type ThreadsConnection } from '@/lib/threads-connection'
import type { CommentPlatform, CommentTemplates } from './comment-item'
import { Comments, commentsHref, loadComments, type CommentsData } from './comments'
import { FilterSelect, RefreshButton, type Pull } from './controls'
import { AutoDmRules, type RuleCard } from './auto-dm-rules'
import { dmHref, Inbox, loadBrand, loadInbox, type Brand, type DmFilter, type Filter } from './inbox'
import { TemplatesPanel } from './templates-panel'
import { loadThreadsComments, ThreadsComments, type ThreadsCommentsData } from './threads-comments'

export const metadata: Metadata = { title: 'Balasan' }

type Tab = 'dm' | 'komentar'

interface BalasanPageProps {
  searchParams: Promise<SearchParams>
}

export default function BalasanPage({ searchParams }: BalasanPageProps) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<LoadingState variant="page" label="Memuat balasan…" />}>
        <BalasanView searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<LoadingState label="Memuat template…" />}>
        <Templates />
      </Suspense>
    </div>
  )
}

const RECONNECT_LINK = 'font-medium underline underline-offset-2'

async function BalasanView({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  await connection()
  const { userId, accountId } = await requireAccount()
  const tab: Tab = firstValue(params.tab) === 'komentar' ? 'komentar' : 'dm'
  const filterParam = firstValue(params.filter)
  const filter: Filter = filterParam === 'semua' ? 'semua' : 'belum'
  const dmFilter: DmFilter = filterParam === 'otomatis' ? 'otomatis' : filter
  const platform: CommentPlatform = tab === 'komentar' && firstValue(params.platform) === 'threads' ? 'threads' : 'instagram'
  const now = new Date()

  let instagram: Connection | null
  try {
    instagram = await getConnection(userId)
  } catch (error) {
    console.error('[balasan] koneksi gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  // Threads only adds a view to Komentar: without it the page works as before.
  const threads = await getThreadsConnection(userId, accountId).catch((error) => {
    console.error('[balasan] koneksi Threads gagal dimuat:', describeError(error))
    return null
  })
  const brand = await loadBrand(userId, accountId, instagram)
  const threadsPull = threads?.status === 'active' && threads.scopes.includes(THREADS_REPLIES_SCOPE)
  const pull: Pull =
    tab === 'komentar' && platform === 'threads'
      ? threadsPull
        ? 'threads'
        : null
      : instagram?.status !== 'active'
        ? null
        : tab === 'dm'
          ? 'dm'
          : instagram.scopes.includes(COMMENTS_SCOPE)
            ? 'komentar'
            : null

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Balasan</h1>
          <p className="text-zinc-500">
            DM dan komentar Instagram yang masuk. Template dan ✨ AI hanya mengisi draf yang kamu kirim sendiri;
            Aturan Auto DM yang aktif membalas komentar dan DM yang cocok secara otomatis.
          </p>
        </div>
        <RefreshButton key={`${tab}-${platform}`} pull={pull} />
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200">
        <nav aria-label="Jenis balasan" className="flex gap-6">
          <TabLink href={dmHref(dmFilter)} active={tab === 'dm'} label="DM" />
          <TabLink href={commentsHref(filter)} active={tab === 'komentar'} label="Komentar" />
        </nav>
        <div className="flex items-center gap-2 pb-2">
          <FilterSelect
            value={tab === 'dm' ? dmFilter : filter}
            hrefs={
              tab === 'dm'
                ? { belum: dmHref('belum'), semua: dmHref('semua'), otomatis: dmHref('otomatis') }
                : { belum: commentsHref('belum', undefined, platform), semua: commentsHref('semua', undefined, platform) }
            }
          />
          <Link
            href="/balasan/auto-dm"
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <Plus size={16} aria-hidden="true" />
            Auto DM
          </Link>
        </div>
      </div>

      {tab === 'dm' ? (
        <div className="space-y-8">
          <DmTab userId={userId} accountId={accountId} filter={dmFilter} params={params} brand={brand} now={now} />
          <RulesSection userId={userId} accountId={accountId} username={instagram?.username ?? 'akunmu'} />
        </div>
      ) : (
        <div className="space-y-4">
          <nav aria-label="Platform komentar" className="flex flex-wrap gap-2">
            <PlatformLink
              href={commentsHref(filter)}
              active={platform === 'instagram'}
              label={instagram ? `Instagram @${instagram.username}` : 'Instagram'}
            />
            <PlatformLink
              href={commentsHref(filter, undefined, 'threads')}
              active={platform === 'threads'}
              label={threads ? `Threads @${threads.username}` : 'Threads'}
            />
          </nav>
          {platform === 'threads' ? (
            <ThreadsCommentsTab
              userId={userId}
              accountId={accountId}
              filter={filter}
              params={params}
              brand={brand}
              now={now}
              threads={threads}
            />
          ) : (
            <CommentsTab
              userId={userId}
              accountId={accountId}
              filter={filter}
              params={params}
              brand={brand}
              now={now}
              instagram={instagram}
            />
          )}
        </div>
      )}
    </div>
  )
}

function PlatformLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full px-3 py-1 text-sm ${active ? 'bg-zinc-900 text-white' : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
    >
      {label}
    </Link>
  )
}

/** The DM templates as quick replies under comments; without them the reply box works as before. */
async function loadCommentTemplates(userId: string, accountId: string): Promise<CommentTemplates | undefined> {
  try {
    const [templates, variables] = await Promise.all([listTemplates(userId, accountId), getVariables(userId, accountId)])
    return { templates, variables }
  } catch (error) {
    console.error('[balasan] template gagal dimuat untuk komentar:', describeError(error))
    return undefined
  }
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`-mb-px border-b-2 pb-2.5 text-sm font-medium ${
        active ? 'border-accent text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-900'
      }`}
    >
      {label}
    </Link>
  )
}

interface TabProps {
  userId: string
  accountId: string
  filter: Filter
  params: SearchParams
  brand: Brand
  now: Date
}

async function DmTab({ userId, accountId, filter, params, brand, now }: Omit<TabProps, 'filter'> & { filter: DmFilter }) {
  const selectedId = firstValue(params.c)
  let data: Awaited<ReturnType<typeof loadInbox>>
  try {
    data = await loadInbox(userId, accountId, filter, selectedId, now)
  } catch (error) {
    console.error('[balasan] DM gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  return <Inbox {...data} filter={filter} selectedId={selectedId} brand={brand} now={now} />
}

async function RulesSection({ userId, accountId, username }: { userId: string; accountId: string; username: string }) {
  let cards: RuleCard[]
  try {
    const rules = await listRules(userId, accountId)
    const runs = await latestRuns(
      userId,
      rules.map((rule) => rule.id),
    )
    cards = rules.map((rule) => ({ rule, run: runs.get(rule.id) ?? null }))
  } catch (error) {
    console.error('[auto-dm] aturan gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  return <AutoDmRules cards={cards} username={username} />
}

async function CommentsTab({ instagram, ...props }: TabProps & { instagram: Connection | null }) {
  const { userId, accountId, filter, params, brand, now } = props
  let data: CommentsData
  try {
    data = await loadComments(userId, accountId, filter, firstValue(params.post), now)
  } catch (error) {
    console.error('[balasan] komentar gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  const templates = data.view === 'post' ? await loadCommentTemplates(userId, accountId) : undefined
  return (
    <div className="space-y-4">
      <CommentsNotice instagram={instagram} />
      <Comments data={data} filter={filter} brand={brand} now={now} templates={templates} />
    </div>
  )
}

async function ThreadsCommentsTab({ threads, ...props }: TabProps & { threads: ThreadsConnection | null }) {
  const { userId, accountId, filter, params, brand, now } = props
  let data: ThreadsCommentsData
  try {
    data = await loadThreadsComments(userId, accountId, filter, firstValue(params.post), now)
  } catch (error) {
    console.error('[balasan] balasan Threads gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  const templates = data.view === 'post' ? await loadCommentTemplates(userId, accountId) : undefined
  return (
    <div className="space-y-4">
      <ThreadsNotice threads={threads} />
      <ThreadsComments data={data} filter={filter} brand={brand} now={now} templates={templates} />
    </div>
  )
}

function ThreadsNotice({ threads }: { threads: ThreadsConnection | null }) {
  // A plain <a>: the route redirects off-site to Threads.
  const reconnect = (
    <a href="/api/auth/threads/start" className={RECONNECT_LINK}>
      Hubungkan ulang Threads
    </a>
  )
  if (!threads) {
    return (
      <Notice tone="warning">
        Hubungkan Threads di{' '}
        <Link href="/pengaturan#threads" className={RECONNECT_LINK}>
          Pengaturan
        </Link>{' '}
        untuk melihat dan membalas balasan di post Threads.
      </Notice>
    )
  }
  if (threads.status === 'needs_reconnect') {
    return (
      <Notice tone="error">
        Token Threads kedaluwarsa atau dicabut, jadi balasan tidak bisa ditarik. {reconnect} dengan @{threads.username}.
      </Notice>
    )
  }
  if (!threads.scopes.includes(THREADS_REPLIES_SCOPE)) {
    return <Notice tone="warning">Komentar Threads butuh izin membaca balasan. {reconnect} sekali.</Notice>
  }
  return null
}

function CommentsNotice({ instagram }: { instagram: Connection | null }) {
  if (!instagram) return <Notice tone="warning">Hubungkan akun Instagram dulu di Pengaturan.</Notice>
  // A plain <a>: the route redirects off-site to Instagram.
  const reconnect = (
    <a href="/api/auth/instagram/start" className={RECONNECT_LINK}>
      Hubungkan ulang Instagram
    </a>
  )
  if (instagram.status === 'needs_reconnect') {
    return (
      <Notice tone="error">
        Token Instagram kedaluwarsa atau dicabut, jadi komentar tidak bisa ditarik. {reconnect} dengan @
        {instagram.username}.
      </Notice>
    )
  }
  if (!instagram.scopes.includes(COMMENTS_SCOPE)) {
    return (
      <Notice tone="warning">
        Komentar butuh izin baru untuk membaca dan membalas komentar. {reconnect} sekali dan masuk dengan @
        {instagram.username}.
      </Notice>
    )
  }
  return null
}

async function Templates() {
  await connection()
  const { userId, accountId } = await requireAccount()
  let templates: DmTemplate[]
  let variablesText: string
  try {
    const [list, variables] = await Promise.all([listTemplates(userId, accountId), getVariables(userId, accountId)])
    templates = list
    variablesText = formatVariables(variables)
  } catch (error) {
    console.error('[balasan] template gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  return <TemplatesPanel templates={templates} variablesText={variablesText} />
}
