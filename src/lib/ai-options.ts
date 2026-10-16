/** Choices and limits of the AI assistant, shared by the editor panel and the server. */

export const GOALS = {
  promosi: 'Promosi atau jualan',
  edukasi: 'Edukasi atau tips',
  interaksi: 'Interaksi dengan pengikut',
  cerita: 'Cerita di balik layar',
  pengumuman: 'Pengumuman',
} as const

export const TONES = {
  santai: 'Santai',
  profesional: 'Profesional',
  lucu: 'Lucu',
  hangat: 'Hangat dan inspiratif',
} as const

export const REWRITE_STYLES = {
  santai: 'Lebih santai',
  profesional: 'Lebih profesional',
  singkat: 'Lebih singkat',
  panjang: 'Lebih panjang',
  cta: '+ CTA',
} as const

export type Goal = keyof typeof GOALS
export type Tone = keyof typeof TONES
export type RewriteStyle = keyof typeof REWRITE_STYLES

export const TOPIC_MAX_LENGTH = 300
export const AUDIENCE_MAX_LENGTH = 150

export interface Brief {
  topic: string
  goal: Goal
  tone: Tone
  audience: string
  /** Photos in the editor, so the model knows a single photo from a carousel. */
  photoCount: number
}

export type AiRequest =
  | { task: 'captions'; brief: Brief }
  | { task: 'ideas'; brief: Brief }
  | { task: 'rewrite'; style: RewriteStyle; caption: string }
  | { task: 'hashtags'; caption: string }

export type AiTask = AiRequest['task']

export type AiResult = { options: string[] } | { error: string }
