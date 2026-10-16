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
export function inspectCaption(caption: string): CaptionInfo {
  // Code points, like Postgres char_length, so the counter agrees with the database CHECK.
  const length = Array.from(caption).length
  const hashtags = findHashtags(caption).length
  const mentions = caption.match(MENTION)?.length ?? 0

  const errors: string[] = []
  if (length > CAPTION_MAX_LENGTH) errors.push('Caption lebih dari 2.200 karakter.')
  if (hashtags > CAPTION_MAX_HASHTAGS) errors.push('Hashtag lebih dari 30.')
  if (mentions > CAPTION_MAX_MENTIONS) errors.push('Mention lebih dari 20.')
  return { length, hashtags, mentions, errors }
}
