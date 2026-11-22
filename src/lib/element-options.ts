/** Elemen AI: what the editor and the server agree on about the owner's description. Pure. */

export const ELEMENT_PROMPT_MAX = 200
export const ELEMENT_PROMPT_MIN = 3

/** The description as one line, or null when it is too short or too long to draw. */
export function cleanElementPrompt(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length >= ELEMENT_PROMPT_MIN && text.length <= ELEMENT_PROMPT_MAX ? text : null
}
