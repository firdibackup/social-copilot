/** Choices and limits of Buat Konten, shared by the editor and the server. */
import { lengthOf } from './brand-options'
import { isImageFormat, MAX_SLIDES, type ImageFormat } from './image-options'
import { isUuid } from './params'

export const TOPIC_MAX_LENGTH = 500
export const INSTRUCTION_MAX_LENGTH = 500
export const DEFAULT_SLIDES = 3
export { MAX_SLIDES }

/** What the composer sends to make a new post. */
export interface ContentRequest {
  topic: string
  slides: number
  format: ImageFormat
  /** A brand reference every slide follows. */
  referenceId: string | null
  includeLogo: boolean
  /** The idea the topic came from, used up when the post is made. */
  ideaId: string | null
}

/** A brand reference the composer offers. */
export interface ReferenceOption {
  id: string
  url: string
  label: string
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
/** Trimmed, with textarea CRLF as LF. */
const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')
const optionalId = (value: unknown) => (value === null || value === undefined || value === '' ? null : value)

/** Validates what the composer sent. The server action's parameter type is only a hint. */
export function parseContentRequest(value: unknown): { request: ContentRequest } | { error: string } {
  if (!isObject(value)) return { error: 'Permintaan tidak valid.' }
  const topic = text(value.topic)
  const { slides, format } = value
  const referenceId = optionalId(value.referenceId)
  const ideaId = optionalId(value.ideaId)

  if (!topic) return { error: 'Tulis topik atau ide konten dulu.' }
  if (lengthOf(topic) > TOPIC_MAX_LENGTH) return { error: `Topik maksimal ${TOPIC_MAX_LENGTH} karakter.` }
  if (typeof slides !== 'number' || !Number.isInteger(slides) || slides < 1 || slides > MAX_SLIDES) {
    return { error: `Jumlah slide 1–${MAX_SLIDES}.` }
  }
  if (!isImageFormat(format)) return { error: 'Format gambar tidak dikenal.' }
  if (referenceId !== null && !isUuid(referenceId)) return { error: 'Referensi tidak ditemukan.' }
  if (ideaId !== null && !isUuid(ideaId)) return { error: 'Ide tidak ditemukan.' }
  return { request: { topic, slides, format, referenceId, includeLogo: value.includeLogo === true, ideaId } }
}

/** An edit the owner typed into the composer. */
export function parseInstruction(value: unknown): string | { error: string } {
  const instruction = text(value)
  if (!instruction) return { error: 'Tulis perubahan yang diinginkan dulu.' }
  if (lengthOf(instruction) > INSTRUCTION_MAX_LENGTH) {
    return { error: `Perubahan maksimal ${INSTRUCTION_MAX_LENGTH} karakter.` }
  }
  return instruction
}
