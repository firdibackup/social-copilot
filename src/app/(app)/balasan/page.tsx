import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Notice } from '@/components/notice'
import { requireUser } from '@/lib/auth'
import { getVariables, listTemplates } from '@/lib/dm'
import { formatVariables, type DmTemplate } from '@/lib/dm-templates'
import { describeError, loadErrorMessage } from '@/lib/errors'
import type { SearchParams } from '@/lib/params'
import { RefreshButton } from './controls'
import { Inbox } from './inbox'
import { TemplatesPanel } from './templates-panel'

export const metadata: Metadata = { title: 'Balasan' }

interface BalasanPageProps {
  searchParams: Promise<SearchParams>
}

export default function BalasanPage({ searchParams }: BalasanPageProps) {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Balasan</h1>
          <p className="text-zinc-500">
            DM Instagram yang masuk. Aturan Auto DM mengisi draf balasan dari template; kamu tetap memeriksa dan
            menekan Kirim sendiri.
          </p>
        </div>
        <RefreshButton />
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-500">Memuat DM…</p>}>
        <Inbox searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-zinc-500">Memuat aturan…</p>}>
        <Templates />
      </Suspense>
    </div>
  )
}

async function Templates() {
  await connection()
  const userId = await requireUser()
  let templates: DmTemplate[]
  let variablesText: string
  try {
    const [list, variables] = await Promise.all([listTemplates(userId), getVariables(userId)])
    templates = list
    variablesText = formatVariables(variables)
  } catch (error) {
    console.error('[balasan] aturan gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }
  return <TemplatesPanel templates={templates} variablesText={variablesText} />
}
