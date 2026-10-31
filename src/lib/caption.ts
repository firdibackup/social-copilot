import type { Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/editor.json'
import enMessages from '../../messages/en/editor.json'

export const CAPTION_MAX_LENGTH = 2200
export const CAPTION_MAX_HASHTAGS = 30
export const CAPTION_MAX_MENTIONS = 20

const HASHTAG = /#[\p{L}\p{N}_]+/gu
const MENTION = /@[A-Za-z0-9._]+/g

/** Hashtags as Instagram counts them, in order of appearance. */
export function findHashtags(caption: string): string[] {
  return caption.match(HASHTAG) ?? []
}

export interface CaptionInfo {
  length: number
  hashtags: number
  mentions: number
  errors: string[]
}

/** Meta's caption limits. Shared by the editor counters and the server action. */
export function inspectCaption(caption: string, locale: Locale = 'id'): CaptionInfo {
  const messages = (locale === 'en' ? enMessages : idMessages).captionValidation
  // Code points, like Postgres char_length, so the counter agrees with the database CHECK.
  const length = Array.from(caption).length
  const hashtags = findHashtags(caption).length
  const mentions = caption.match(MENTION)?.length ?? 0

  const errors: string[] = []
  if (length > CAPTION_MAX_LENGTH) errors.push(messages.length)
  if (hashtags > CAPTION_MAX_HASHTAGS) errors.push(messages.hashtags)
  if (mentions > CAPTION_MAX_MENTIONS) errors.push(messages.mentions)
  return { length, hashtags, mentions, errors }
}
