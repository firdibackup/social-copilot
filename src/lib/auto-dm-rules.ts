import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idInbox from '../../messages/id/inbox.json'
import enInbox from '../../messages/en/inbox.json'

const ruleTranslations = (locale: Locale) => createTranslator({ locale, messages: locale === 'en' ? enInbox : idInbox, namespace: 'validation' })

/** Auto DM rules: their shape, validation, matching and the DMs they send. Pure, so the form and tests share it. */

export const NAME_MAX_LENGTH = 60
export const KEYWORD_MAX_LENGTH = 50
export const MAX_KEYWORDS = 20
export const MAX_VARIATIONS = 10
export const VARIATION_MAX_LENGTH = 300
/** Instagram cuts longer button titles; the form counts down from it. */
export const BUTTON_MAX_LENGTH = 20
/** Meta's limit for a button template's text. */
export const TEMPLATE_TEXT_MAX_LENGTH = 640
/** A plain text DM, as in the inbox (REPLY_MAX_LENGTH). */
export const TEXT_MAX_LENGTH = 1000
export const URL_MAX_LENGTH = 2000
/** One run per rule and person in this many hours, however often they comment. */
export const PERSON_COOLDOWN_HOURS = 24
export const EXAMPLE_KEYWORDS = ['MAU', 'LINK', 'HARGA'] as const

const PAYLOAD_PREFIX = 'autodm:'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_ID = /^\d+$/
// Letters and digits on either side mean the keyword is only part of a longer word.
const WORD_EDGE = '[\\p{L}\\p{N}]'

/** What the form edits and the server stores. */
export interface AutoDmRuleInput {
  name: string
  scope: 'all' | 'one'
  /** The one post (Instagram media id); null for every post. */
  mediaId: string | null
  /** "kata apa pun". `keywords` stay for when the owner switches back. */
  matchAny: boolean
  keywords: string[]
  wholeWord: boolean
  dmTrigger: boolean
  publicReply: boolean
  publicReplies: string[]
  opener: boolean
  openerText: string
  openerButton: string
  followGate: boolean
  followText: string
  followButton: string
  mainText: string
  linkButton: boolean
  linkText: string
  linkUrl: string
}

export interface AutoDmRule extends AutoDmRuleInput {
  id: string
  isActive: boolean
  createdAt: Date
}

export const EMPTY_RULE: AutoDmRuleInput = {
  name: '',
  scope: 'all',
  mediaId: null,
  matchAny: false,
  keywords: [],
  wholeWord: true,
  dmTrigger: false,
  publicReply: false,
  publicReplies: [''],
  opener: true,
  openerText: '',
  openerButton: '',
  followGate: false,
  followText: '',
  followButton: '',
  mainText: '',
  linkButton: false,
  linkText: '',
  linkUrl: '',
}

/** The form's copy of a stored rule, with an empty variation to type into when it has none. */
export function toRuleInput(rule: AutoDmRule): AutoDmRuleInput {
  const keys = Object.keys(EMPTY_RULE) as (keyof AutoDmRuleInput)[]
  const input = Object.fromEntries(keys.map((key) => [key, rule[key]])) as unknown as AutoDmRuleInput
  return { ...input, publicReplies: input.publicReplies.length > 0 ? input.publicReplies : [''] }
}

export type RunStep = 'started' | 'opener_sent' | 'follow_requested' | 'main_sent' | 'failed'

export const RUN_STEP_LABELS: Record<RunStep, string> = {
  started: 'Sedang diproses',
  opener_sent: 'DM pembuka terkirim',
  follow_requested: 'Diminta follow dulu',
  main_sent: 'Pesan utama terkirim',
  failed: 'Gagal',
}

export type DmButton =
  | { type: 'postback'; title: string; payload: string }
  | { type: 'web_url'; title: string; url: string }

/** A DM: text alone, or a button template when it has buttons. */
export interface OutgoingDm {
  text: string
  buttons: DmButton[]
}

export interface PlannedDm {
  step: Exclude<RunStep, 'started' | 'failed'>
  message: OutgoingDm
}

export interface RuleTrigger {
  source: 'comment' | 'dm'
  /** The post commented on; null for a DM. */
  mediaId: string | null
  text: string
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One keyword is enough; capitals don't matter. Whole word by default: "link" doesn't hit "linknya". */
export function matchesText(rule: Pick<AutoDmRuleInput, 'matchAny' | 'keywords' | 'wholeWord'>, text: string): boolean {
  if (rule.matchAny) return true
  return rule.keywords.some((keyword) => {
    const literal = escapeRegExp(keyword)
    const pattern = rule.wholeWord ? `(?<!${WORD_EDGE})${literal}(?!${WORD_EDGE})` : literal
    return new RegExp(pattern, 'iu').test(text)
  })
}

/** Rank of a rule when several match: its post's rule before every post's, keywords before any comment. */
const rank = (rule: AutoDmRule) => (rule.mediaId === null ? 2 : 0) + (rule.matchAny ? 1 : 0)

/** The one rule a comment or DM sets off, or null. Expects the account's active rules. */
export function pickRule<T extends AutoDmRule>(rules: readonly T[], trigger: RuleTrigger): T | null {
  const candidates = rules.filter(
    (rule) =>
      (trigger.source === 'dm' ? rule.dmTrigger : rule.mediaId === null || rule.mediaId === trigger.mediaId) &&
      matchesText(rule, trigger.text),
  )
  const sorted = candidates.toSorted((a, b) => rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime())
  return sorted[0] ?? null
}

const isHttpsUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.includes('.')
  } catch {
    return false
  }
}

function buttonProblem(enabled: boolean, title: string, missing: string, locale: Locale): string | null {
  const t = ruleTranslations(locale)
  if (enabled && !title.trim()) return missing
  return title.length > BUTTON_MAX_LENGTH ? t('buttonLimit', { max: BUTTON_MAX_LENGTH }) : null
}

function textProblem(enabled: boolean, text: string, missing: string, max: number, locale: Locale): string | null {
  const t = ruleTranslations(locale)
  if (enabled && !text.trim()) return missing
  if (text.length <= max) return null
  return max === TEMPLATE_TEXT_MAX_LENGTH
    ? t('templateLimit', { max: max })
    : t('textLimit', { max: max })
}

function triggerProblem(rule: AutoDmRuleInput, locale: Locale): string | null {
  const t = ruleTranslations(locale)
  if (!rule.name.trim()) return t('nameRequired')
  if (rule.name.length > NAME_MAX_LENGTH) return t('nameLimit', { max: NAME_MAX_LENGTH })
  if (rule.scope === 'one' && !(rule.mediaId && NUMERIC_ID.test(rule.mediaId))) return t('postRequired')
  if (!rule.matchAny && !rule.keywords.some((keyword) => keyword.trim())) return t('keywordRequired')
  if (rule.keywords.length > MAX_KEYWORDS) return t('keywordCount', { max: MAX_KEYWORDS })
  if (rule.keywords.some((keyword) => keyword.length > KEYWORD_MAX_LENGTH)) {
    return t('keywordLimit', { max: KEYWORD_MAX_LENGTH })
  }
  if (rule.publicReply && !rule.publicReplies.some((reply) => reply.trim())) return t('replyRequired')
  if (rule.publicReplies.length > MAX_VARIATIONS) return t('replyCount', { max: MAX_VARIATIONS })
  if (rule.publicReplies.some((reply) => reply.length > VARIATION_MAX_LENGTH)) {
    return t('replyLimit', { max: VARIATION_MAX_LENGTH })
  }
  return null
}

function messageProblem(rule: AutoDmRuleInput, locale: Locale): string | null {
  const t = ruleTranslations(locale)
  const mainMax = rule.linkButton ? TEMPLATE_TEXT_MAX_LENGTH : TEXT_MAX_LENGTH
  return (
    textProblem(rule.opener, rule.openerText, t('openerRequired'), TEMPLATE_TEXT_MAX_LENGTH, locale) ??
    buttonProblem(rule.opener, rule.openerButton, t('openerButtonRequired'), locale) ??
    textProblem(rule.followGate, rule.followText, t('followRequired'), TEMPLATE_TEXT_MAX_LENGTH, locale) ??
    buttonProblem(rule.followGate, rule.followButton, t('followButtonRequired'), locale) ??
    textProblem(true, rule.mainText, t('mainRequired'), mainMax, locale) ??
    buttonProblem(rule.linkButton, rule.linkText, t('linkButtonRequired'), locale) ??
    (rule.linkUrl.length > URL_MAX_LENGTH || (rule.linkButton && !isHttpsUrl(rule.linkUrl.trim()))
      ? t('urlInvalid')
      : null)
  )
}

/** What still keeps the rule from being saved, or null. Required fields count only in enabled sections. */
export function ruleProblem(rule: AutoDmRuleInput, locale: Locale = 'id'): string | null {
  return triggerProblem(rule, locale) ?? messageProblem(rule, locale)
}

/** Trimmed, keywords deduped ignoring capitals, empty variations dropped, a post only for "Satu post". */
export function normalizeRule(rule: AutoDmRuleInput): AutoDmRuleInput {
  const seen = new Set<string>()
  const keywords = rule.keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword !== '' && !seen.has(keyword.toLowerCase()) && seen.add(keyword.toLowerCase()))
  const mediaId = rule.scope === 'one' && rule.mediaId && NUMERIC_ID.test(rule.mediaId) ? rule.mediaId : null
  return {
    ...rule,
    name: rule.name.trim(),
    mediaId,
    keywords,
    publicReplies: rule.publicReplies.map((reply) => reply.trim()).filter(Boolean),
    openerText: rule.openerText.trim(),
    openerButton: rule.openerButton.trim(),
    followText: rule.followText.trim(),
    followButton: rule.followButton.trim(),
    mainText: rule.mainText.trim(),
    linkText: rule.linkText.trim(),
    linkUrl: rule.linkUrl.trim(),
  }
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const STRING_FIELDS = [
  'name',
  'openerText',
  'openerButton',
  'followText',
  'followButton',
  'mainText',
  'linkText',
  'linkUrl',
] as const
const BOOLEAN_FIELDS = ['matchAny', 'wholeWord', 'dmTrigger', 'publicReply', 'opener', 'followGate', 'linkButton'] as const

/** The rule the browser sent, checked field by field, normalized and validated. */
export function parseRuleInput(value: unknown, locale: Locale = 'id'): { rule: AutoDmRuleInput } | { error: string } {
  const t = ruleTranslations(locale)
  if (!isObject(value)) return { error: t('unreadable') }
  const { scope, mediaId, keywords, publicReplies } = value
  const isShaped =
    STRING_FIELDS.every((field) => typeof value[field] === 'string') &&
    BOOLEAN_FIELDS.every((field) => typeof value[field] === 'boolean') &&
    (scope === 'all' || scope === 'one') &&
    (mediaId === null || typeof mediaId === 'string') &&
    isStringArray(keywords) &&
    isStringArray(publicReplies)
  if (!isShaped) return { error: t('unreadable') }

  const rule = normalizeRule(value as unknown as AutoDmRuleInput)
  const problem = ruleProblem(rule, locale)
  return problem ? { error: problem } : { rule }
}

export const postbackPayload = (ruleId: string) => `${PAYLOAD_PREFIX}${ruleId}`

/** The rule an Auto DM button belongs to; null for any other payload. */
export function ruleIdFromPayload(payload: string): string | null {
  if (!payload.startsWith(PAYLOAD_PREFIX)) return null
  const id = payload.slice(PAYLOAD_PREFIX.length)
  return UUID.test(id) ? id : null
}

const postback = (rule: AutoDmRule, title: string): DmButton => ({
  type: 'postback',
  title,
  payload: postbackPayload(rule.id),
})

export function mainDm(rule: AutoDmRule): PlannedDm {
  const buttons: DmButton[] = rule.linkButton ? [{ type: 'web_url', title: rule.linkText, url: rule.linkUrl }] : []
  return { step: 'main_sent', message: { text: rule.mainText, buttons } }
}

function followDm(rule: AutoDmRule): PlannedDm {
  return { step: 'follow_requested', message: { text: rule.followText, buttons: [postback(rule, rule.followButton)] } }
}

/** The DM a comment or keyword DM gets: the opener, else the follow request, else the main message. */
export function firstDm(rule: AutoDmRule): PlannedDm {
  if (rule.opener) {
    return { step: 'opener_sent', message: { text: rule.openerText, buttons: [postback(rule, rule.openerButton)] } }
  }
  return rule.followGate ? followDm(rule) : mainDm(rule)
}

/** After a tap on the opener or "Sudah follow": followers (or everyone, without the gate) get the main message. */
export function dmAfterTap(rule: AutoDmRule, follows: boolean): PlannedDm {
  return rule.followGate && !follows ? followDm(rule) : mainDm(rule)
}

/** One public reply variation, picked at random so replies don't read like a bot. */
export function pickVariation(variations: readonly string[], random: () => number = Math.random): string {
  return variations[Math.min(variations.length - 1, Math.floor(random() * variations.length))]
}
