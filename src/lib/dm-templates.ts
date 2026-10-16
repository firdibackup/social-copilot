/** A saved reply. With a keyword, it is suggested for customer messages that contain it. */
export interface DmTemplate {
  id: string
  keyword: string | null
  body: string
}

export type Variables = Record<string, string>

/** Instagram's limit for a text DM. Templates share it, since a filled template becomes the reply. */
export const REPLY_MAX_LENGTH = 1000
export const KEYWORD_MAX_LENGTH = 100

/** Filled in from the conversation. Owner variables cannot reuse these names. */
export const BUILT_IN_VARIABLES = {
  sender_name: 'nama pengirim, atau username-nya; "Kak" kalau belum diketahui',
  message_text: 'isi pesan terakhir pelanggan',
} as const

const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/
const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/g
// Letters, digits and _ on either side mean the keyword is only part of a longer word.
const WORD_CHAR = '[\\p{L}\\p{N}_]'

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whole word or phrase, same capitalisation: "promo" matches "ada promo?" but not "promosi" or "Promo". */
export function containsKeyword(text: string, keyword: string): boolean {
  return new RegExp(`(?<!${WORD_CHAR})${escapeRegExp(keyword)}(?!${WORD_CHAR})`, 'u').test(text)
}

/** The first template, in list order, whose keyword appears in the customer's message. */
export function suggestTemplate(templates: DmTemplate[], message: string): DmTemplate | null {
  return templates.find((template) => template.keyword !== null && containsKeyword(message, template.keyword)) ?? null
}

export interface FillContext {
  senderName: string | null
  message: string | null
  variables: Variables
}

/** Unknown placeholders stay as typed, so the owner spots them in the draft before sending. */
export function fillTemplate(body: string, context: FillContext): string {
  const values: Variables = {
    ...context.variables,
    sender_name: context.senderName ?? 'Kak',
    message_text: context.message ?? '',
  }
  return body.replace(PLACEHOLDER, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? values[name] : placeholder,
  )
}

/** Reads the owner's "name = value" lines; blank lines are skipped. */
export function parseVariables(text: string): { variables: Variables } | { error: string } {
  const variables: Variables = {}
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const separator = line.indexOf('=')
    const name = separator === -1 ? '' : line.slice(0, separator).trim()
    if (!VARIABLE_NAME.test(name)) {
      return {
        error: `Baris "${line.trim()}" tidak bisa dibaca. Tulis seperti brand_name = Toko Sinar; nama variabel hanya huruf kecil, angka dan _.`,
      }
    }
    if (Object.hasOwn(BUILT_IN_VARIABLES, name)) return { error: `{${name}} sudah terisi otomatis. Pakai nama lain.` }
    variables[name] = line.slice(separator + 1).trim()
  }
  return { variables }
}

export const formatVariables = (variables: Variables): string =>
  Object.entries(variables)
    .map(([name, value]) => `${name} = ${value}`)
    .join('\n')
