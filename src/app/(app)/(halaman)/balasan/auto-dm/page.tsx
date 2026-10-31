import { inboxLoadError } from '../action-utils'
import { IntlMessages } from '@/i18n/client-messages'
import { getTranslations } from 'next-intl/server'
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
import { describeError } from '@/lib/errors'
import { firstValue, isUuid, type SearchParams } from '@/lib/params'
import { loadBrand } from '../inbox'
import { AutoDmForm } from './auto-dm-form'

export const metadata: Metadata = { title: 'Auto DM' }

interface AutoDmPageProps {
  searchParams: Promise<SearchParams>
}

/** Buat Auto DM, or Ubah with `?id=` (a query parameter rather than a [id] segment, as in Admin). */
export default async function AutoDmPage({ searchParams }: AutoDmPageProps) {
  const t = await getTranslations('inbox.builderPage')
  return (
    <IntlMessages namespaces={['common', 'inbox']}>
    <Suspense fallback={<LoadingState variant="form" label={t('loadingAutoDm')} />}>
      <AutoDmEditor searchParams={searchParams} />
    </Suspense>
    </IntlMessages>
  )
}

async function AutoDmEditor({ searchParams }: AutoDmPageProps) {
  const t = await getTranslations('inbox.builderPage')
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
    return <Notice tone="warning">{await inboxLoadError(error)}</Notice>
  }

  if (id && !rule) {
    return (
      <div className="space-y-3">
        <Notice tone="warning">{t('ruleNotFound')}</Notice>
        <Link href="/balasan" className="text-sm font-medium text-zinc-700 underline underline-offset-2">
          {t('backToReplies')}
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
      title={rule?.name ?? t('createAutoDm')}
      username={instagram?.username ?? t('yourAccount')}
      avatarUrl={brand.logoUrl}
    />
  )
}
