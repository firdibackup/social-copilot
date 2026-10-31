import { intlLocale } from '@/i18n/locale-config'

import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/editor.json'
import enMessages from '../../messages/en/editor.json'
/** A post's slide-by-slide script, written by the AI from an idea and edited by the owner. Shared by the editor and the server. */
import { lengthOf, truncate } from './brand-options'
import { HEADLINE_MAX_LENGTH, headlineLimit, MAX_SLIDES } from './image-options'

/** A body line that is a point: its "- " or "• " marker, then its text. */
export const BULLET = /^(\s*[-•]\s)(.*)$/

export const SCRIPT_LABEL_MAX_LENGTH = 40
export const SCRIPT_TITLE_MAX_LENGTH = 120

export interface ScriptSlide {
  /** What the slide is for the owner, e.g. "Hook", "IN", or "CTA"; not written on the image. */
  label: string
  /** The slide's heading on the image. */
  title: string
  /** The rest of the slide's text: sentences or points, one per line. */
  body: string
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')

/** Everything the slide's image shows: the heading, then the body. */
export const scriptHeadline = (slide: ScriptSlide) => [slide.title, slide.body].filter(Boolean).join('\n')

/** One slide of the AI's answer, trimmed to what fits: the body gives way so the image text stays within its limit. */
export function cleanScriptSlide(value: unknown): ScriptSlide | null {
  if (!isObject(value)) return null
  const label = truncate(text(value.label), SCRIPT_LABEL_MAX_LENGTH)
  const title = truncate(text(value.title), SCRIPT_TITLE_MAX_LENGTH)
  const room = HEADLINE_MAX_LENGTH - (title ? lengthOf(title) + 1 : 0)
  const body = truncate(text(value.body), room).trimEnd()
  return title || body ? { label, title, body } : null
}

/** Why the slide can't be made as written, or null. A single post's one slide gets the single post's text limit. */
export function slideProblem(slide: ScriptSlide, number: number, single = false, locale: Locale = 'id'): string | null {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'scriptOptions' })

  if (!slide.title && !slide.body) return t('message1', { v0: number })
  if (lengthOf(slide.label) > SCRIPT_LABEL_MAX_LENGTH) return t('message2', { v0: number })
  if (lengthOf(slide.title) > SCRIPT_TITLE_MAX_LENGTH) return t('message3', { v0: number, v1: SCRIPT_TITLE_MAX_LENGTH })
  const limit = headlineLimit(single)
  if (lengthOf(scriptHeadline(slide)) > limit) {
    return single
      ? t('message4', { v0: limit.toLocaleString(intlLocale(locale)) })
      : t('message5', { v0: number, v1: limit })
  }
  return null
}

/** Validates a script the owner edited or that was stored. The server action's parameter type is only a hint. */
export function parseScript(value: unknown, locale: Locale = 'id'): { script: ScriptSlide[] } | { error: string } {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'scriptOptions' })

  if (!Array.isArray(value) || value.length === 0) return { error: t('message6') }
  if (value.length > MAX_SLIDES) return { error: t('message7', { v0: MAX_SLIDES }) }
  const script: ScriptSlide[] = []
  for (const [index, raw] of value.entries()) {
    if (!isObject(raw)) return { error: t('message8') }
    const slide = { label: text(raw.label), title: text(raw.title), body: text(raw.body) }
    const problem = slideProblem(slide, index + 1, value.length === 1, locale)
    if (problem) return { error: problem }
    script.push(slide)
  }
  return { script }
}

// "Slide 2 — Isi", also with "-", "–" or ":" or without a label; "Slide 2 hari lagi" is text.
const SLIDE_LINE = /^\s*slide\s+\d+\s*(?:[—–:-]\s*(.*?))?\s*$/i

/** A script as the composer's text: each slide's "Slide N — label" line, its title, then its body, a blank line apart. */
export const scriptToText = (script: ScriptSlide[]): string =>
  script
    .map((slide, index) =>
      [`Slide ${index + 1}${slide.label ? ` — ${slide.label}` : ''}`, slide.title, slide.body].filter(Boolean).join('\n'),
    )
    .join('\n\n')

export interface ScriptLine {
  /** Text above the first slide line, a slide line, a slide's title (its first line with text), or the rest. */
  kind: 'intro' | 'slide' | 'title' | 'body'
  /** The slide's index, -1 above the first slide line. */
  slide: number
}

/** What each line of the composer's text is, as readScriptText reads it. */
export function scriptLines(value: string): ScriptLine[] {
  let slide = -1
  let titled = false
  return value.split('\n').map((line): ScriptLine => {
    if (SLIDE_LINE.test(line)) {
      slide += 1
      titled = false
      return { kind: 'slide', slide }
    }
    if (slide < 0) return { kind: 'intro', slide }
    if (titled || !line.trim()) return { kind: 'body', slide }
    titled = true
    return { kind: 'title', slide }
  })
}

/** The composer's text split into slides, unchecked; null when it has no slide line and is a plain topic. */
export function splitScriptText(value: string): { intro: string; slides: ScriptSlide[] } | null {
  const rows = value.replace(/\r\n/g, '\n').split('\n')
  const lines = scriptLines(rows.join('\n'))
  const count = lines.filter((line) => line.kind === 'slide').length
  if (count === 0) return null
  const join = (slide: number, kind: ScriptLine['kind']) =>
    rows
      .filter((_, at) => lines[at].slide === slide && lines[at].kind === kind)
      .join('\n')
      .trim()
  const slides = Array.from({ length: count }, (_, slide) => ({
    label: join(slide, 'slide').match(SLIDE_LINE)?.[1] ?? '',
    title: join(slide, 'title'),
    body: join(slide, 'body'),
  }))
  return { intro: join(-1, 'intro'), slides }
}

/** The composer's text as a checked script, an error naming the slide that can't be made, or null for a plain topic. */
export function readScriptText(value: string, locale: Locale = 'id'): { intro: string; script: ScriptSlide[] } | { error: string } | null {
  const split = splitScriptText(value)
  if (!split) return null
  const checked = parseScript(split.slides, locale)
  return 'error' in checked ? checked : { intro: split.intro, script: checked.script }
}
