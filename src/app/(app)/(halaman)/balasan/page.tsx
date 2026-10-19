import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Notice } from '@/components/notice'
import { requireAccount } from '@/lib/auth'
import { getBrandKit } from '@/lib/brand'
import { getConnection, type Connection } from '@/lib/connection'
import { getVariables, listTemplates } from '@/lib/dm'
import { formatVariables, type DmTemplate } from '@/lib/dm-templates'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { COMMENTS_SCOPE } from '@/lib/instagram'
import { firstValue, type SearchParams } from '@/lib/params'
import { Comments, commentsHref, loadComments, type CommentsData } from './comments'
import { FilterSelect, RefreshButton, type Pull } from './controls'
import { dmHref, Inbox, loadInbox, type Brand, type Filter } from './inbox'
import { NewRuleButton, TemplatesPanel } from './templates-panel'

export const metadata: Metadata = { title: 'Balasan' }

type Tab = 'dm' | 'komentar'

interface BalasanPageProps {
  searchParams: Promise<SearchParams>
}

export default function BalasanPage({ searchParams }: BalasanPageProps) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<p className="text-sm text-zinc-500">Memuat balasan…</p>}>
        <BalasanView searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-zinc-500">Memuat aturan…</p>}>
        <Templates />
      </Suspense>
    </div>
  )
}

const RECONNECT_LINK = 'font-medium underline underline-offset-2'

async function loadBrand(userId: string, accountId: string, instagram: Connection | null): Promise<Brand> {
  const kit = await getBrandKit(userId, accountId).catch((error: unknown) => {
    console.error('[balasan] brand gagal dimuat:', describeError(error))
    return null
  })
  return { name: kit?.name || (instagram ? `@${instagram.username}` : 'Brand'), logoUrl: kit?.logoUrl ?? null }
}

async function BalasanView({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  await connection()
  const { userId, accountId } = await requireAccount()
  const tab: Tab = firstValue(params.tab) === 'komentar' ? 'komentar' : 'dm'
  const filter: Filter = firstValue(params.filter) === 'semua' ? 'semua' : 'belum'
  const now = new Date()

  let instagram: Connection | null
  try {
    instagram = await getConnection(userId)
  } catch (error) {
    console.error('[balasan] koneksi gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  const brand = await loadBrand(userId, accountId, instagram)
  const pull: Pull =
    instagram?.status !== 'active' ? null : tab === 'dm' ? 'dm' : instagram.scopes.includes(COMMENTS_SCOPE) ? 'komentar' : null

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Balasan</h1>
          <p className="text-zinc-500">
            DM dan komentar Instagram yang masuk. Template dan ✨ AI hanya mengisi draf; kamu tetap memeriksa dan
            menekan Kirim sendiri.
          </p>
        </div>
        <RefreshButton key={tab} pull={pull} />
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200">
        <nav aria-label="Jenis balasan" className="flex gap-6">
          <TabLink href={dmHref(filter)} active={tab === 'dm'} label="DM" />
          <TabLink href={commentsHref(filter)} active={tab === 'komentar'} label="Komentar" />
        </nav>
        <div className="flex items-center gap-2 pb-2">
          <FilterSelect
            value={filter}
            hrefs={
              tab === 'dm'
                ? { belum: dmHref('belum'), semua: dmHref('semua') }
                : { belum: commentsHref('belum'), semua: commentsHref('semua') }
            }
          />
          <NewRuleButton />
        </div>
      </div>

      {tab === 'dm' ? (
        <DmTab userId={userId} accountId={accountId} filter={filter} params={params} brand={brand} now={now} />
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
  )
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

async function DmTab({ userId, accountId, filter, params, brand, now }: TabProps) {
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

async function CommentsTab({ instagram, ...props }: TabProps & { instagram: Connection | null }) {
  const { userId, accountId, filter, params, brand, now } = props
  let data: CommentsData
  try {
    data = await loadComments(userId, accountId, filter, firstValue(params.post), now)
  } catch (error) {
    console.error('[balasan] komentar gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  return (
    <div className="space-y-4">
      <CommentsNotice instagram={instagram} />
      <Comments data={data} filter={filter} brand={brand} now={now} />
    </div>
  )
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
    console.error('[balasan] aturan gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  return <TemplatesPanel templates={templates} variablesText={variablesText} />
}
