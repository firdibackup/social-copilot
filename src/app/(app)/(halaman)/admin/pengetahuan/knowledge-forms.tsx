'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect } from 'react'
import { Notice } from '@/components/notice'
import { confirmSubmit } from '@/lib/confirm-submit'
import type { CaseRow, HookRow, KnowledgeAccount } from '@/lib/knowledge'
import { CASE_EXCERPT_MAX, HOOK_STRUCTURE_MAX, HOOK_USE_WHEN_MAX, OUTCOMES, scopeKeyOf, TOPIC_MAX, VERDICTS } from '@/lib/knowledge-options'
import type { FormState } from '../actions'
import { BUTTON, DANGER_BUTTON, FIELD, HINT, LABEL, PRIMARY_BUTTON } from '../ui'
import { knowledgeAction, previewAction, type PreviewState } from './actions'

const INITIAL: FormState = { error: null, success: null }
const PREVIEW_INITIAL: PreviewState = { error: null, topic: '', result: null }

/** Back to the list after a new row is saved or a row is deleted; an edit stays open with its message. */
function useBackOnSuccess(state: FormState, href: string) {
  const router = useRouter()
  useEffect(() => {
    if (state.success) router.replace(href)
  }, [state, href, router])
}

function Messages({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>
  if (state.success) return <Notice tone="success">{state.success}</Notice>
  return null
}

function DeleteButton({ intent, id, list, label }: { intent: 'delete_hook' | 'delete_case'; id: string; list: string; label: string }) {
  const t = useTranslations('admin')
  const [state, action, pending] = useActionState(knowledgeAction, INITIAL)
  useBackOnSuccess(state, list)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="originalId" value={id} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <button type="submit" disabled={pending} className={DANGER_BUTTON}
        onClick={(event) => void confirmSubmit(event, { title: label, description: t('pengetahuan_forms.deleteDescription'), confirmLabel: t('pengetahuan_forms.delete'), tone: 'danger' })}>
        {t('pengetahuan_forms.delete')}
      </button>
    </form>
  )
}

export function HookForm({ hook }: { hook: HookRow | null }) {
  const t = useTranslations('admin')
  const [state, action, pending] = useActionState(knowledgeAction, INITIAL)
  const list = '/admin/pengetahuan?tab=hook'
  useBackOnSuccess(hook ? INITIAL : state, list)
  return (
    <div className="space-y-4">
      <p className={HINT}>{t('pengetahuan_forms.hookHelp')}</p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="intent" value="save_hook" />
        {hook && <input type="hidden" name="originalId" value={hook.id} />}
        <label className={LABEL}>
          <span>ID</span>
          {hook ? <p className="font-mono text-sm text-zinc-700">{hook.id}</p> : <input name="id" maxLength={60} className={FIELD} placeholder="OWN-001" />}
          {!hook && <span className={HINT}>{t('pengetahuan_forms.idHelp')}</span>}
        </label>
        <label className={LABEL}>
          <span>{t('pengetahuan_forms.structure')}</span>
          <input name="structure" required maxLength={HOOK_STRUCTURE_MAX} defaultValue={hook?.structure} className={FIELD} placeholder="[JUMLAH] tanda [MASALAH_SPESIFIK]" />
          <span className={HINT}>{t('pengetahuan_forms.structureHelp')}</span>
        </label>
        <label className={LABEL}>
          <span>{t('pengetahuan_forms.useWhen')}</span>
          <textarea name="useWhen" required rows={3} maxLength={HOOK_USE_WHEN_MAX} defaultValue={hook?.useWhen} className={FIELD} />
          <span className={HINT}>{t('pengetahuan_forms.useWhenHelp')}</span>
        </label>
        <label className={LABEL}>
          <span>{t('pengetahuan_forms.sources')}</span>
          <input name="sources" defaultValue={hook?.sources.join(', ')} className={FIELD} placeholder="S01, S02" />
          <span className={HINT}>{t('pengetahuan_forms.sourcesHelp')}</span>
        </label>
        <Messages state={state} />
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>{pending ? t('pengetahuan_forms.saving') : t('pengetahuan_forms.save')}</button>
      </form>
      {hook && <DeleteButton intent="delete_hook" id={hook.id} list={list} label={t('pengetahuan_forms.deleteHook', { id: hook.id })} />}
    </div>
  )
}

export function CaseForm({ item, accounts }: { item: CaseRow | null; accounts: KnowledgeAccount[] }) {
  const t = useTranslations('admin')
  const [state, action, pending] = useActionState(knowledgeAction, INITIAL)
  const list = '/admin/pengetahuan?tab=kasus'
  useBackOnSuccess(item ? INITIAL : state, list)
  const scope = item?.userId && item.accountId ? `${item.userId}:${item.accountId}` : 'all'
  const known = scope === 'all' || accounts.some((account) => scopeKeyOf(account) === scope)
  return (
    <div className="space-y-4">
      <p className={HINT}>{t('pengetahuan_forms.caseHelp')}</p>
      {item?.diagnostic && <Notice tone="warning">{t('pengetahuan_forms.diagnosticNote')}</Notice>}
      <form action={action} className="space-y-4">
        <input type="hidden" name="intent" value="save_case" />
        {item && <input type="hidden" name="originalId" value={item.id} />}
        <label className={LABEL}>
          <span>ID</span>
          {item ? <p className="font-mono text-sm text-zinc-700">{item.id}</p> : <input name="id" maxLength={60} className={FIELD} placeholder="OWNER-001" />}
          {!item && <span className={HINT}>{t('pengetahuan_forms.idHelp')}</span>}
        </label>
        <label className={LABEL}>
          <span>{t('pengetahuan_forms.scope')}</span>
          <select name="scope" defaultValue={scope} className={FIELD}>
            <option value="all">{t('pengetahuan_page.allAccounts')}</option>
            {!known && <option value={scope} disabled>{item?.accountId}</option>}
            {accounts.map((account) => (
              <option key={scopeKeyOf(account)} value={scopeKeyOf(account)}>
                {account.connected ? account.label : t('pengetahuan_forms.notConnected', { label: account.label })}
              </option>
            ))}
          </select>
          <span className={HINT}>{t('pengetahuan_forms.scopeHelp')}</span>
        </label>
        <label className={LABEL}>
          <span>{t('pengetahuan_forms.tags')}</span>
          <input name="tags" required defaultValue={item?.tags.join(', ')} className={FIELD} placeholder="kpr, dp, cicilan" />
          <span className={HINT}>{t('pengetahuan_forms.tagsHelp')}</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={LABEL}>
            <span>{t('pengetahuan_forms.verdict')}</span>
            <select name="verdict" defaultValue={item?.verdict ?? 'failure'} className={FIELD}>
              {VERDICTS.map((value) => <option key={value} value={value}>{t(`pengetahuan_forms.verdict_${value}`)}</option>)}
            </select>
          </label>
          <label className={LABEL}>
            <span>{t('pengetahuan_forms.outcome')}</span>
            <select name="outcome" defaultValue={item?.outcome ?? 'observed_failure'} className={FIELD}>
              {OUTCOMES.map((value) => <option key={value} value={value}>{t(`pengetahuan_forms.outcome_${value}`)}</option>)}
            </select>
            <span className={HINT}>{t('pengetahuan_forms.outcomeHelp')}</span>
          </label>
        </div>
        <label className={LABEL}>
          <span>{t('pengetahuan_forms.excerpt')}</span>
          <textarea name="excerpt" required rows={4} maxLength={CASE_EXCERPT_MAX} defaultValue={item?.excerpt} className={FIELD} />
          <span className={HINT}>{t('pengetahuan_forms.excerptHelp')}</span>
        </label>
        <label className={LABEL}>
          <span>{t('pengetahuan_forms.reason')}</span>
          <textarea name="reason" required rows={3} defaultValue={item?.reason} className={FIELD} />
          <span className={HINT}>{t('pengetahuan_forms.reasonHelp')}</span>
        </label>
        <label className={LABEL}>
          <span>{t('pengetahuan_forms.principle')}</span>
          <textarea name="principle" required rows={3} defaultValue={item?.principle} className={FIELD} />
          <span className={HINT}>{t('pengetahuan_forms.principleHelp')}</span>
        </label>
        {item && <p className={HINT}>{t('pengetahuan_forms.provenance', { assessment: item.assessment, kind: item.provenanceKind ?? '—' })}</p>}
        <Messages state={state} />
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>{pending ? t('pengetahuan_forms.saving') : t('pengetahuan_forms.save')}</button>
      </form>
      {item && <DeleteButton intent="delete_case" id={item.id} list={list} label={t('pengetahuan_forms.deleteCase', { id: item.id })} />}
    </div>
  )
}

export function PreviewForm({ accounts }: { accounts: KnowledgeAccount[] }) {
  const t = useTranslations('admin')
  const [state, action, pending] = useActionState(previewAction, PREVIEW_INITIAL)
  const connected = accounts.filter((account) => account.connected)
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <label className={LABEL}>
          <span>{t('pengetahuan_forms.topic')}</span>
          <textarea name="topic" required rows={3} maxLength={TOPIC_MAX} defaultValue={state.topic} className={FIELD} placeholder={t('pengetahuan_forms.topicPlaceholder')} />
        </label>
        <label className={LABEL}>
          <span>{t('pengetahuan_forms.account')}</span>
          <select name="scope" defaultValue="" className={FIELD}>
            <option value="">{t('pengetahuan_forms.noAccount')}</option>
            {connected.map((account) => <option key={scopeKeyOf(account)} value={scopeKeyOf(account)}>{account.label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={pending} className={BUTTON}>{pending ? t('pengetahuan_forms.searching') : t('pengetahuan_forms.search')}</button>
      </form>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.result && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2" aria-live="polite">
            <h3 className="text-sm font-semibold text-zinc-900">{t('pengetahuan_forms.hooksFound', { count: state.result.hooks.length })}</h3>
            {state.result.hooks.length === 0 ? <p className={HINT}>{t('pengetahuan_forms.noHooks')}</p> : (
              <ul className="space-y-2">
                {state.result.hooks.map((hook) => (
                  <li key={hook.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                    <span className="font-mono text-xs text-zinc-500">{hook.id}</span>
                    <p className="font-medium text-zinc-900">{hook.structure}</p>
                    <p className="text-zinc-600">{hook.use_when}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2" aria-live="polite">
            <h3 className="text-sm font-semibold text-zinc-900">{t('pengetahuan_forms.casesFound', { count: state.result.cases?.length ?? 0 })}</h3>
            {state.result.cases === null ? <p className={HINT}>{t('pengetahuan_forms.casesNeedAccount')}</p>
              : state.result.cases.length === 0 ? <p className={HINT}>{t('pengetahuan_forms.noCases')}</p> : (
                <ul className="space-y-2">
                  {state.result.cases.map((item) => (
                    <li key={item.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                      <span className="font-mono text-xs text-zinc-500">{item.id} · {t(`pengetahuan_forms.verdict_${item.verdict as 'failure'}`)}</span>
                      <p className="text-zinc-700">{item.principle}</p>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
      )}
    </div>
  )
}
