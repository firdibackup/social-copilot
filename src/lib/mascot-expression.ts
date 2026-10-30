/** Faces drawn inside the mascot SVG; `data-e` on the SVG picks one (CSS in globals.css). Every face has a mouth. */
export type Expression =
  | 'idle'
  | 'smile'
  | 'wink'
  | 'happy'
  | 'wow'
  | 'sleepy'
  /** Brows up, mouth chattering along: the owner is typing. */
  | 'curious'
  /** One brow up, one eye squinting, crooked mouth: the message is a question. */
  | 'hmm'
  /** Happy eyes, big grin, blush and sparkles: the message ends with "!". */
  | 'excited'
  /** Worried brows, wavy mouth, a drop of sweat: the owner keeps erasing. */
  | 'worried'
  /** Happy eyes, smile, big blush: thanks or praise. */
  | 'shy'
/** What Mimo is doing, as the page knows it. */
export type Mood = 'idle' | 'smile' | 'thinking' | 'happy'

export interface MascotState {
  mood: Mood
  /** A short face that wins over everything: a click, waking up, a sent message. */
  burst: Expression | null
  blink: boolean
  sleepy: boolean
  /** The owner is typing or hovering the mascot. */
  attentive: boolean
  /** The face for what is being typed in the Mimo composer, until the owner pauses. */
  typing: Expression | null
}

/** What the SVG shows: the face, and whether its eyes are shut for a blink (`data-blink`). */
export interface Face {
  expression: Expression
  blink: boolean
}

export const MOOD_EXPRESSION: Record<Mood, Expression> = { idle: 'idle', smile: 'smile', thinking: 'wow', happy: 'happy' }

/** Marks the text field that composer-bound mascots react to. */
export const MIMO_FIELD_ATTR = 'data-mimo-field'
/** Window event the Mimo composer fires when a message goes out: composer-bound mascots cheer. */
export const MIMO_SENT_EVENT = 'mimo:sent'

/** Faces with open eyes, which a blink briefly shuts; the mouth stays. */
const BLINKING = new Set<Expression>(['idle', 'smile', 'wow', 'curious', 'hmm', 'worried'])
export const canBlink = (expression: Expression) => BLINKING.has(expression)

/** The face before blinks and bursts. */
export function baseExpression(state: MascotState): Expression {
  // While Mimo is thinking its own face stays; otherwise it reacts to what is being typed.
  if (state.typing && state.mood !== 'thinking') return state.typing
  if (state.sleepy && state.mood !== 'thinking') return 'sleepy'
  return state.attentive && state.mood === 'idle' ? 'smile' : MOOD_EXPRESSION[state.mood]
}

export function resolveFace(state: MascotState): Face {
  if (state.burst) return { expression: state.burst, blink: false }
  const expression = baseExpression(state)
  return { expression, blink: state.blink && canBlink(expression) }
}

export interface TypingSignal {
  /** The field's text after the change. */
  text: string
  /** Deletions in a row; 0 after anything typed. */
  erasing: number
  /** The change was a paste. */
  pasted?: boolean
}

const ERASE_BURST = 4
const LONG_TEXT = 280
const LONG_PASTE = 120
const THANKS = /\b(makasih|terima ?kasih|trims|thanks?|thx|mantap|keren|hebat)\b/i
const GREETING = /^\s*(halo|hallo|hai|hi|hello|hey|pagi|siang|sore|malam)\b/i

/** The face for the composer's text as it changes; null when there is nothing to react to. */
export function typingExpression({ text, erasing, pasted = false }: TypingSignal): Expression | null {
  if (erasing >= ERASE_BURST) return 'worried'
  const trimmed = text.trim()
  if (!trimmed) return null
  if (pasted && trimmed.length >= LONG_PASTE) return 'wow'
  if (trimmed.endsWith('?')) return 'hmm'
  if (trimmed.endsWith('!')) return 'excited'
  if (THANKS.test(trimmed.slice(-40))) return 'shy'
  if (trimmed.length < 24 && GREETING.test(trimmed)) return 'wink'
  if (trimmed.length >= LONG_TEXT) return 'wow'
  return 'curious'
}
