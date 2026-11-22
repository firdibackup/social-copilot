import { createTranslator } from 'use-intl/core'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/admin.json'
import enMessages from '../../messages/en/admin.json'

/**
 * Pengetahuan: pure rules for the owner-edited RAG rows (`hook_templates`, `study_cases`), shared by the admin form,
 * its actions and tests. The allowed values mirror the CHECK constraints of 20261122010000_study_cases.sql.
 */

export const VERDICTS = ['failure', 'qualified_success'] as const
export const OUTCOMES = ['observed_failure', 'observed_qualified_success', 'correction_unvalidated', 'verified_correction'] as const
export type Verdict = (typeof VERDICTS)[number]
export type Outcome = (typeof OUTCOMES)[number]
/** A failure can't claim success: the table's own check. */
const FAILURE_FORBIDS: readonly Outcome[] = ['observed_qualified_success', 'verified_correction']

/** The table allows only 'model' and 'human_approved'; a case the owner writes is human-approved. */
export const OWNER_ASSESSMENT = 'human_approved'
export const OWNER_PROVENANCE = { kind: 'owner_lesson', human_approved: true } as const
/** retrieve_study_cases skips these (20261122020000_writer_case_scope.sql); they stay for audits. */
export const DIAGNOSTIC_KIND = 'engineering_diagnostic_not_writer_exemplar'

export const HOOK_STRUCTURE_MAX = 200
export const HOOK_USE_WHEN_MAX = 500
export const CASE_EXCERPT_MAX = 1200
export const CASE_TEXT_MAX = 2000
export const CASE_TAGS_MAX = 12
export const TOPIC_MAX = 6000

const ID = /^[A-Z0-9][A-Z0-9_-]{1,59}$/
/** A placeholder as the curated rows write it: [HASIL], [ALAT/METODE], [A]. */
const PLACEHOLDER = /\[[A-Z0-9_/]+\]/g

export class KnowledgeError extends Error {
  override name = 'KnowledgeError'
}

export interface HookInput {
  /** Null: the data layer picks the next free one. */
  id: string | null
  structure: string
  useWhen: string
  sources: string[]
}

export interface CaseScope {
  userId: string
  accountId: string
}

export interface CaseInput {
  id: string | null
  /** Null: every account. */
  scope: CaseScope | null
  tags: string[]
  verdict: Verdict
  outcome: Outcome
  excerpt: string
  reason: string
  principle: string
}

const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')
const messages = (locale: Locale) => createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'knowledge_validation' })

/** Ids are stored in capitals; empty means "make one". */
export function parseId(value: unknown, locale: Locale = 'id'): string | null {
  const id = text(value).toUpperCase()
  if (!id) return null
  if (!ID.test(id)) throw new KnowledgeError(messages(locale)('id'))
  return id
}

/** Comma- or newline-separated words, trimmed, without repeats. */
export function splitList(value: unknown): string[] {
  return [...new Set(text(value).split(/[,\n]/).map((item) => item.trim()).filter(Boolean))]
}

/** A hook row is a pattern with [PLACEHOLDER]s, never a finished sentence with a brand's numbers or claims. */
export function parseHook(input: { id?: unknown; structure: unknown; useWhen: unknown; sources?: unknown }, locale: Locale = 'id'): HookInput {
  const t = messages(locale)
  const structure = text(input.structure).replace(/\s+/g, ' ')
  const useWhen = text(input.useWhen)
  if (!structure) throw new KnowledgeError(t('structureRequired'))
  if (structure.length > HOOK_STRUCTURE_MAX) throw new KnowledgeError(t('structureTooLong', { max: HOOK_STRUCTURE_MAX }))
  if (!structure.match(PLACEHOLDER)) throw new KnowledgeError(t('structureNeedsPlaceholder'))
  // Numbers belong in a placeholder ([JUMLAH]); a written number is a claim the writer would copy to other brands.
  if (/\d/.test(structure.replace(PLACEHOLDER, ''))) throw new KnowledgeError(t('structureHasNumber'))
  if (!useWhen) throw new KnowledgeError(t('useWhenRequired'))
  if (useWhen.length > HOOK_USE_WHEN_MAX) throw new KnowledgeError(t('useWhenTooLong', { max: HOOK_USE_WHEN_MAX }))
  return { id: parseId(input.id, locale), structure, useWhen, sources: splitList(input.sources).slice(0, 10) }
}

/** `scope` is "all" or "<userId>:<accountId>" and must be one of `accounts`, the accounts the form offered. */
export function parseCase(
  input: { id?: unknown; scope: unknown; tags: unknown; verdict: unknown; outcome: unknown; excerpt: unknown; reason: unknown; principle: unknown },
  accounts: CaseScope[],
  locale: Locale = 'id',
): CaseInput {
  const t = messages(locale)
  const scopeKey = text(input.scope)
  let scope: CaseScope | null = null
  if (scopeKey !== 'all') {
    scope = accounts.find((account) => scopeKeyOf(account) === scopeKey) ?? null
    if (!scope) throw new KnowledgeError(t('scopeUnknown'))
  }
  // Lowercase before removing repeats: retrieval compares lowercased, so "KPR" and "kpr" are one tag.
  const tags = splitList(text(input.tags).toLowerCase())
  if (tags.length === 0) throw new KnowledgeError(t('tagsRequired'))
  if (tags.length > CASE_TAGS_MAX) throw new KnowledgeError(t('tagsTooMany', { max: CASE_TAGS_MAX }))
  if (tags.some((tag) => tag.length < 2 || tag.length > 40)) throw new KnowledgeError(t('tagLength'))
  const verdict = text(input.verdict) as Verdict
  const outcome = text(input.outcome) as Outcome
  if (!VERDICTS.includes(verdict)) throw new KnowledgeError(t('verdictUnknown'))
  if (!OUTCOMES.includes(outcome)) throw new KnowledgeError(t('outcomeUnknown'))
  if (verdict === 'failure' && FAILURE_FORBIDS.includes(outcome)) throw new KnowledgeError(t('failureOutcome'))
  const excerpt = text(input.excerpt)
  const reason = text(input.reason)
  const principle = text(input.principle)
  if (!excerpt) throw new KnowledgeError(t('excerptRequired'))
  if (excerpt.length > CASE_EXCERPT_MAX) throw new KnowledgeError(t('excerptTooLong', { max: CASE_EXCERPT_MAX }))
  if (!reason) throw new KnowledgeError(t('reasonRequired'))
  if (!principle) throw new KnowledgeError(t('principleRequired'))
  if (reason.length > CASE_TEXT_MAX || principle.length > CASE_TEXT_MAX) throw new KnowledgeError(t('textTooLong', { max: CASE_TEXT_MAX }))
  return { id: parseId(input.id, locale), scope, tags, verdict, outcome, excerpt, reason, principle }
}

export const scopeKeyOf = (scope: CaseScope) => `${scope.userId}:${scope.accountId}`

export function isDiagnostic(provenance: unknown): boolean {
  return typeof provenance === 'object' && provenance !== null && (provenance as { kind?: unknown }).kind === DIAGNOSTIC_KIND
}

/** The next "<prefix>-NNN" not in `taken`, so an empty id field still gives a readable one. */
export function nextId(prefix: string, taken: string[]): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  const highest = taken.reduce((max, id) => Math.max(max, Number(pattern.exec(id)?.[1] ?? 0)), 0)
  return `${prefix}-${String(highest + 1).padStart(3, '0')}`
}
