import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireAdmin } from '@/lib/auth'
import { ConfigError, describeError } from '@/lib/errors'
import { listCases, listHooks, listKnowledgeAccounts, type CaseRow, type HookRow, type KnowledgeAccount } from '@/lib/knowledge'
import { firstValue, type SearchParams } from '@/lib/params'
import { BUTTON, CARD, CARD_TITLE, HINT, PRIMARY_BUTTON, TABLE, TD, TH } from '../ui'
import { CaseForm, HookForm, PreviewForm } from './knowledge-forms'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin')
  return { title: t('pengetahuan_page.title') }
}

interface PengetahuanPageProps {
  searchParams: Promise<SearchParams>
}

type Tab = 'hook' | 'kasus' | 'uji'
const TABS: Tab[] = ['hook', 'kasus', 'uji']
/** `?id=baru` opens an empty form; any other id opens that row. A query parameter, not a [id] segment (see Admin). */
const NEW = 'baru'

export default async function PengetahuanPage({ searchParams }: PengetahuanPageProps) {
  const t = await getTranslations('admin')
  return (
    <Suspense fallback={<LoadingState variant="table" label={t('pengetahuan_page.loading')} />}>
      <Knowledge searchParams={searchParams} />
    </Suspense>
  )
}

async function Knowledge({ searchParams }: PengetahuanPageProps) {
  const t = await getTranslations('admin')
  await connection()
  await requireAdmin()
  const params = await searchParams
  const tabParam = firstValue(params.tab)
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'hook'
  const id = firstValue(params.id)?.trim() ?? ''

  let hooks: HookRow[]
  let cases: CaseRow[]
  let accounts: KnowledgeAccount[]
  try {
    ;[hooks, cases, accounts] = await Promise.all([listHooks(), listCases(), listKnowledgeAccounts()])
  } catch (error) {
    console.error('[admin] pengetahuan gagal dimuat:', describeError(error))
    return <Notice tone="warning">{error instanceof ConfigError ? t('loadErrors.configuration', { message: error.message }) : t('loadErrors.database')}</Notice>
  }
  const accountName = (row: { userId: string | null; accountId: string | null }) =>
    row.accountId ? accounts.find((a) => a.userId === row.userId && a.accountId === row.accountId)?.label ?? row.accountId : t('pengetahuan_page.allAccounts')

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-zinc-500">{t('pengetahuan_page.intro')}</p>
      </div>
      <nav aria-label={t('pengetahuan_page.sections')} className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Link key={item} href={`/admin/pengetahuan?tab=${item}`} aria-current={tab === item ? 'page' : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === item ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'}`}>
            {t(`pengetahuan_page.tab_${item}`)}
          </Link>
        ))}
      </nav>

      {tab === 'hook' && (id ? <HookDetail hooks={hooks} id={id} /> : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={CARD_TITLE}>{t('pengetahuan_page.hooksCount', { count: hooks.length })}</h2>
            <Link href={`/admin/pengetahuan?tab=hook&id=${NEW}`} className={PRIMARY_BUTTON}>{t('pengetahuan_page.addHook')}</Link>
          </div>
          <p className={HINT}>{t('pengetahuan_forms.hookHelp')}</p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className={TABLE}>
              <thead className="border-b border-zinc-100">
                <tr><th className={TH}>ID</th><th className={TH}>{t('pengetahuan_forms.structure')}</th><th className={TH}>{t('pengetahuan_forms.useWhen')}</th><th className={TH}><span className="sr-only">{t('pengetahuan_page.actions')}</span></th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {hooks.map((hook) => (
                  <tr key={hook.id} className="hover:bg-zinc-50">
                    <td className={`${TD} whitespace-nowrap font-mono text-xs text-zinc-600`}>{hook.id}</td>
                    <td className={`${TD} font-medium text-zinc-900`}>{hook.structure}</td>
                    <td className={`${TD} text-zinc-600`}>{hook.useWhen}</td>
                    <td className={`${TD} text-right`}><Link href={`/admin/pengetahuan?tab=hook&id=${encodeURIComponent(hook.id)}`} className={BUTTON}>{t('pengetahuan_page.edit')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {tab === 'kasus' && (id ? <CaseDetail cases={cases} accounts={accounts} id={id} /> : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={CARD_TITLE}>{t('pengetahuan_page.casesCount', { count: cases.length })}</h2>
            <Link href={`/admin/pengetahuan?tab=kasus&id=${NEW}`} className={PRIMARY_BUTTON}>{t('pengetahuan_page.addCase')}</Link>
          </div>
          <p className={HINT}>{t('pengetahuan_forms.caseHelp')}</p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className={TABLE}>
              <thead className="border-b border-zinc-100">
                <tr><th className={TH}>ID</th><th className={TH}>{t('pengetahuan_forms.scope')}</th><th className={TH}>{t('pengetahuan_forms.tags')}</th><th className={TH}>{t('pengetahuan_forms.verdict')}</th><th className={TH}>{t('pengetahuan_forms.principle')}</th><th className={TH}><span className="sr-only">{t('pengetahuan_page.actions')}</span></th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {cases.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50">
                    <td className={`${TD} whitespace-nowrap font-mono text-xs text-zinc-600`}>
                      {item.id}
                      {item.diagnostic && <span className="mt-1 block w-fit rounded-full bg-amber-50 px-2 py-0.5 font-sans text-xs font-medium text-amber-800 ring-1 ring-amber-200">{t('pengetahuan_page.notForWriter')}</span>}
                    </td>
                    <td className={`${TD} text-zinc-700`}>{accountName(item)}</td>
                    <td className={`${TD} text-zinc-600`}>{item.tags.join(', ')}</td>
                    <td className={`${TD} whitespace-nowrap text-zinc-700`}>{t(`pengetahuan_forms.verdict_${item.verdict as 'failure'}`)}<span className="block text-xs text-zinc-500">{t(`pengetahuan_forms.outcome_${item.outcome as 'observed_failure'}`)}</span></td>
                    <td className={`${TD} text-zinc-600`}>{item.principle}</td>
                    <td className={`${TD} text-right`}><Link href={`/admin/pengetahuan?tab=kasus&id=${encodeURIComponent(item.id)}`} className={BUTTON}>{t('pengetahuan_page.edit')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {tab === 'uji' && (
        <section className={CARD}>
          <div className="space-y-1">
            <h2 className={CARD_TITLE}>{t('pengetahuan_page.tab_uji')}</h2>
            <p className={HINT}>{t('pengetahuan_forms.previewHelp')}</p>
          </div>
          <PreviewForm accounts={accounts} />
        </section>
      )}
    </div>
  )
}

async function HookDetail({ hooks, id }: { hooks: HookRow[]; id: string }) {
  const t = await getTranslations('admin')
  const hook = id === NEW ? null : hooks.find((item) => item.id === id)
  return (
    <section className={CARD}>
      <Link href="/admin/pengetahuan?tab=hook" className="text-sm text-zinc-500 hover:text-zinc-900">{t('pengetahuan_page.backToHooks')}</Link>
      {hook === undefined ? <Notice tone="warning">{t('pengetahuan_actions.notFound')}</Notice> : <HookForm key={hook?.id ?? NEW} hook={hook} />}
    </section>
  )
}

async function CaseDetail({ cases, accounts, id }: { cases: CaseRow[]; accounts: KnowledgeAccount[]; id: string }) {
  const t = await getTranslations('admin')
  const item = id === NEW ? null : cases.find((row) => row.id === id)
  return (
    <section className={CARD}>
      <Link href="/admin/pengetahuan?tab=kasus" className="text-sm text-zinc-500 hover:text-zinc-900">{t('pengetahuan_page.backToCases')}</Link>
      {item === undefined ? <Notice tone="warning">{t('pengetahuan_actions.notFound')}</Notice> : <CaseForm key={item?.id ?? NEW} item={item} accounts={accounts} />}
    </section>
  )
}
