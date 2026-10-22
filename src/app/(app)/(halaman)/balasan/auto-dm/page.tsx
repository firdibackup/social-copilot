import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireAccount } from '@/lib/auth'
import { getRule } from '@/lib/auto-dm'
import { EMPTY_RULE, toRuleInput, type AutoDmRule } from '@/lib/auto-dm-rules'
import { getConnection, type Connection } from '@/lib/connection'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { firstValue, isUuid, type SearchParams } from '@/lib/params'
import { loadBrand } from '../inbox'
import { AutoDmForm } from './auto-dm-form'

export const metadata: Metadata = { title: 'Auto DM' }

interface AutoDmPageProps {
  searchParams: Promise<SearchParams>
}

/** Buat Auto DM, or Ubah with `?id=` (a query parameter rather than a [id] segment, as in Admin). */
export default function AutoDmPage({ searchParams }: AutoDmPageProps) {
  return (
    <Suspense fallback={<LoadingState variant="form" label="Memuat Auto DM…" />}>
      <AutoDmEditor searchParams={searchParams} />
    </Suspense>
  )
}

async function AutoDmEditor({ searchParams }: AutoDmPageProps) {
  const params = await searchParams
  await connection()
  const { userId, accountId } = await requireAccount()
  const id = firstValue(params.id)

  let rule: AutoDmRule | null
  let instagram: Connection | null
  try {
    ;[rule, instagram] = await Promise.all([
      id && isUuid(id) ? getRule(userId, accountId, id) : null,
      getConnection(userId),
    ])
  } catch (error) {
    console.error('[auto-dm] aturan gagal dimuat:', describeError(error))
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  if (id && !rule) {
    return (
      <div className="space-y-3">
        <Notice tone="warning">Aturan tidak ditemukan.</Notice>
        <Link href="/balasan" className="text-sm font-medium text-zinc-700 underline underline-offset-2">
          Kembali ke Balasan
        </Link>
      </div>
    )
  }

  const brand = await loadBrand(userId, accountId, instagram)
  return (
    <AutoDmForm
      key={rule?.id ?? 'baru'}
      ruleId={rule?.id ?? null}
      initial={rule ? toRuleInput(rule) : EMPTY_RULE}
      title={rule?.name ?? 'Buat Auto DM'}
      username={instagram?.username ?? 'akunmu'}
      avatarUrl={brand.logoUrl}
    />
  )
}
