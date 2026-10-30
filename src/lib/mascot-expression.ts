/** Faces drawn inside the mascot SVG; `data-e` on the SVG picks one (CSS in globals.css). */
export type Expression = 'idle' | 'smile' | 'blink' | 'wink' | 'happy' | 'wow' | 'sleepy'
/** What Sigap is doing, as the page knows it. */
export type Mood = 'idle' | 'smile' | 'thinking' | 'happy'

export interface MascotState {
  mood: Mood
  /** A short face that wins over everything: a click, waking up. */
  burst: Expression | null
  blink: boolean
  sleepy: boolean
  /** The owner is typing or hovering the mascot. */
  attentive: boolean
}

export const MOOD_EXPRESSION: Record<Mood, Expression> = { idle: 'idle', smile: 'smile', thinking: 'wow', happy: 'happy' }

export function resolveExpression(state: MascotState): Expression {
  if (state.burst) return state.burst
  const base: Expression =
    state.sleepy && state.mood !== 'thinking' ? 'sleepy' : state.attentive && state.mood === 'idle' ? 'smile' : MOOD_EXPRESSION[state.mood]
  const blinks = base === 'idle' || base === 'smile' || base === 'wow'
  return state.blink && blinks ? 'blink' : base
}
