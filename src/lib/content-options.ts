
import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/editor.json'
import enMessages from '../../messages/en/editor.json'
/** Choices and limits of Buat Konten, shared by the editor and the server. */
import { lengthOf } from './brand-options'
import { isTextDensity, type TextDensity } from './density-options'
import { isImageFormat, MAX_SLIDES, type ImageFormat } from './image-options'
import { isUuid } from './params'

export const TOPIC_MAX_LENGTH = 5000
export const INSTRUCTION_MAX_LENGTH = 500
export const DEFAULT_SLIDES = 3
export { MAX_SLIDES }

/** The composer's reference choice that lets the server pick from all of the account's references. */
export const AUTO_REFERENCE = 'auto'
export const AUTO_PRODUCT = 'auto'
const PILLAR_ID = /^[a-z0-9-]{1,40}$/

/** What the composer sends to make a new post. */
export interface ContentRequest {
  topic: string
  slides: number
  format: ImageFormat
  /** Which references the slides follow: all of the account's (AUTO_REFERENCE, by label), one group's id, or none. */
  referenceId: string | null
  /** Product groups the planner may choose from: all active groups, one group, or none. */
  productGroupId: string | null
  /** The content-strategy pillar this post follows, or null to let the planner choose automatically. */
  pillarId: string | null
  includeLogo: boolean
  /** How much text goes on each slide; a script keeps its own text. */
  density: TextDensity
  /** The idea the topic came from, used up when the post is made. */
  ideaId: string | null
}

/** A brand reference the composer offers. */
export interface ProductOption {
  id: string
  label: string
  description: string
  imageCount: number
}

export interface ReferenceOption {
  id: string
  label: string
  /** Images in the group: a carousel lends each slide the matching one. */
  slideCount: number
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
/** Trimmed, with textarea CRLF as LF. */
const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')
const optionalId = (value: unknown) => (value === null || value === undefined || value === '' ? null : value)

/** Validates what the composer sent. The server action's parameter type is only a hint. */
export function parseContentRequest(value: unknown, locale: Locale = 'id'): { request: ContentRequest } | { error: string } {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'contentOptions' })

  if (!isObject(value)) return { error: t('message1') }
  const topic = text(value.topic)
  const { slides, format } = value
  const referenceId = optionalId(value.referenceId)
  const productGroupId = optionalId(value.productGroupId)
  const pillarId = optionalId(value.pillarId)
  const ideaId = optionalId(value.ideaId)

  if (!topic) return { error: t('message2') }
  if (lengthOf(topic) > TOPIC_MAX_LENGTH) return { error: t('message3', { v0: TOPIC_MAX_LENGTH }) }
  if (typeof slides !== 'number' || !Number.isInteger(slides) || slides < 1 || slides > MAX_SLIDES) {
    return { error: t('message4', { v0: MAX_SLIDES }) }
  }
  if (!isImageFormat(format)) return { error: t('message5') }
  if (referenceId !== null && referenceId !== AUTO_REFERENCE && !isUuid(referenceId)) {
    return { error: t('message6') }
  }
  if (productGroupId !== null && productGroupId !== AUTO_PRODUCT && !isUuid(productGroupId)) {
    return { error: t('message7') }
  }
  if (typeof pillarId !== 'string' && pillarId !== null) return { error: t('message8') }
  if (pillarId !== null && !PILLAR_ID.test(pillarId)) return { error: t('message8') }
  if (ideaId !== null && !isUuid(ideaId)) return { error: t('message9') }
  if (!isTextDensity(value.density)) return { error: t('message10') }
  return {
    request: {
      topic,
      slides,
      format,
      referenceId,
      productGroupId,
      pillarId,
      includeLogo: value.includeLogo === true,
      density: value.density,
      ideaId,
    },
  }
}

/** An edit the owner typed into the composer. */
export function parseInstruction(value: unknown, locale: Locale = 'id'): string | { error: string } {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'contentOptions' })

  const instruction = text(value)
  if (!instruction) return { error: t('message11') }
  if (lengthOf(instruction) > INSTRUCTION_MAX_LENGTH) {
    return { error: t('message12', { v0: INSTRUCTION_MAX_LENGTH }) }
  }
  return instruction
}
