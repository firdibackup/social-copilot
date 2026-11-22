'use server'

import { getLocale, getTranslations } from 'next-intl/server'

import { refresh } from 'next/cache'
import { logAdminAction } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { deleteCase, deleteHook, listKnowledgeAccounts, previewRetrieval, saveCase, saveHook, type RetrievalPreview } from '@/lib/knowledge'
import { KnowledgeError, parseCase, parseHook, parseId, scopeKeyOf, TOPIC_MAX } from '@/lib/knowledge-options'
import type { FormState } from '../actions'

export type KnowledgeIntent = 'save_hook' | 'delete_hook' | 'save_case' | 'delete_case'

const failed = (error: string): FormState => ({ error, success: null })

/**
 * Every change to the RAG tables, picked by the form's `intent`. `originalId` is the saved row being edited or
 * deleted; without it `save_*` creates a row (an empty `id` gets the next OWN-/OWNER- number).
 */
export async function knowledgeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations('admin')
  const admin = await requireAdmin()
  const locale = await getLocale()
  const intent = String(formData.get('intent') ?? '') as KnowledgeIntent
  let message: string
  try {
    const originalId = parseId(formData.get('originalId'), locale)
    switch (intent) {
      case 'save_hook': {
        const input = parseHook({ id: formData.get('id'), structure: formData.get('structure'), useWhen: formData.get('useWhen'), sources: formData.get('sources') }, locale)
        const id = await saveHook(input, originalId)
        await logAdminAction(admin, originalId ? 'update_hook' : 'create_hook', null, { id, structure: input.structure })
        message = t('pengetahuan_actions.hookSaved', { id })
        break
      }
      case 'save_case': {
        const accounts = await listKnowledgeAccounts()
        const input = parseCase({
          id: formData.get('id'), scope: formData.get('scope'), tags: formData.get('tags'), verdict: formData.get('verdict'),
          outcome: formData.get('outcome'), excerpt: formData.get('excerpt'), reason: formData.get('reason'), principle: formData.get('principle'),
        }, accounts, locale)
        const id = await saveCase(input, originalId)
        await logAdminAction(admin, originalId ? 'update_case' : 'create_case', null, {
          id, scope: input.scope ? scopeKeyOf(input.scope) : 'all', tags: input.tags, verdict: input.verdict, outcome: input.outcome,
        })
        message = t('pengetahuan_actions.caseSaved', { id })
        break
      }
      case 'delete_hook':
      case 'delete_case': {
        if (!originalId) return failed(t('pengetahuan_actions.notFound'))
        await (intent === 'delete_hook' ? deleteHook : deleteCase)(originalId)
        await logAdminAction(admin, intent, null, { id: originalId })
        message = t('pengetahuan_actions.deleted', { id: originalId })
        break
      }
      default:
        return failed(t('pengetahuan_actions.unknownAction'))
    }
  } catch (error) {
    if (error instanceof KnowledgeError) return failed(error.message)
    console.error('[admin] aksi pengetahuan gagal:', describeError(error))
    return failed(t('pengetahuan_actions.failed'))
  }
  refresh()
  return { error: null, success: message }
}

export type PreviewState = { error: string | null; topic: string; result: RetrievalPreview | null }

/** What retrieve_hooks and retrieve_study_cases return for a topic; reads only, so it isn't logged. */
export async function previewAction(_previous: PreviewState, formData: FormData): Promise<PreviewState> {
  const t = await getTranslations('admin')
  await requireAdmin()
  const topic = String(formData.get('topic') ?? '').trim().slice(0, TOPIC_MAX)
  if (!topic) return { error: t('pengetahuan_actions.topicRequired'), topic, result: null }
  try {
    const scope = String(formData.get('scope') ?? '')
    const account = scope ? (await listKnowledgeAccounts()).find((item) => scopeKeyOf(item) === scope) ?? null : null
    if (scope && !account) return { error: t('knowledge_validation.scopeUnknown'), topic, result: null }
    return { error: null, topic, result: await previewRetrieval(topic, account) }
  } catch (error) {
    console.error('[admin] uji pencarian gagal:', describeError(error))
    return { error: t('pengetahuan_actions.failed'), topic, result: null }
  }
}
