import type { Locale } from '@/i18n/locale-config'

export type { Locale } from '@/i18n/locale-config'

/** ID is intentionally a no-op: existing prompts (including whitespace) must not change. */
export function outputLanguageInstruction(language: Locale = 'id'): string {
  return language === 'en'
    ? 'Write all output in English. This language rule overrides any Indonesian-language directions in the task, brand voice, history, or examples. Use natural, friendly English and address the reader as "you", not "kamu". Indonesian phrases in the instructions are style examples only: adapt them into English, never copy them into new content. This applies to captions, titles, slide text, descriptions, tags, analyses, summaries, replies, and human-readable tool arguments. Keep JSON keys, enum values, IDs, URLs, brand names, and explicitly quoted source text unchanged. Preserve approved script text that the task explicitly requires copying verbatim. Do not change the requested output format.'
    : ''
}

/** Localize only the language directive, not the task or its structured-data contract. */
export function languagePrompt(prompt: string, language: Locale = 'id'): string {
  if (language === 'id') return prompt
  return `${prompt.replace(/bahasa Indonesia/gi, 'English')}\n\n${outputLanguageInstruction(language)}`
}
