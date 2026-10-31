'use server'

import { getLocale } from 'next-intl/server'

import { getTranslations } from 'next-intl/server'

import { AiOutputError, aiErrorMessage } from '@/lib/ai'
import { requireAccount } from '@/lib/auth'
import { parseInstruction } from '@/lib/content-options'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { PlatformError, saveThreadItems } from '@/lib/post-threads'
import { MAX_THREAD_ITEMS, splitThreadText, threadsLength, THREADS_TEXT_LIMIT, parseThreadItems } from '@/lib/thread-items'
import { editThread, writeThread } from '@/lib/threads-ai'

export type ThreadItemsResult = { postId: string } | { error: string }
export type ThreadsAiResult = { texts: string[] } | { error: string }

const fieldsOf = (input: unknown) => (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>

/** Splits over-long model posts only when every resulting post still fits in the editor's ten-item chain. */
function fitThreadAnswer(texts: string[]): string[] {
  const fitted = texts.flatMap((text) => threadsLength(text) > THREADS_TEXT_LIMIT ? splitThreadText(text) : [text.trim()])
  if (fitted.length < 1 || fitted.length > MAX_THREAD_ITEMS
    || fitted.some((text) => !text || threadsLength(text) > THREADS_TEXT_LIMIT)) {
    throw new AiOutputError('hasil Threads terlalu panjang')
  }
  return fitted
}

/** Write a new Threads chain, rewrite the whole chain, or rewrite only one post. */
export async function threadsAiAction(input: unknown): Promise<ThreadsAiResult> {
  const t = await getTranslations('editor.threadsActions')
  const locale = await getLocale()

  const { userId } = await requireAccount()
  const fields = fieldsOf(input)
  if (!Array.isArray(fields.texts) || fields.texts.length > MAX_THREAD_ITEMS
    || !fields.texts.every((text) => typeof text === 'string')) {
    return { error: t('message1') }
  }
  const texts = (fields.texts as string[]).map((text) => text.replace(/\r\n/g, '\n'))
  const instruction = parseInstruction(fields.instruction, locale)
  if (typeof instruction !== 'string') return instruction
  const target = fields.target
  if (target !== null && (typeof target !== 'number' || !Number.isInteger(target) || target < 0 || target >= texts.length)) {
    return { error: t('message2') }
  }

  try {
    const blank = texts.every((text) => !text.trim())
    if (blank) return { texts: fitThreadAnswer(await writeThread(userId, instruction, locale)) }
    if (target === null) return { texts: fitThreadAnswer(await editThread(userId, texts, instruction, null, locale)) }
    const answer = fitThreadAnswer(await editThread(userId, texts, instruction, target, locale))
    const revised = [...texts.slice(0, target), ...answer, ...texts.slice(target + 1)]
    if (revised.length > MAX_THREAD_ITEMS
      || revised.some((text) => !text.trim() || threadsLength(text) > THREADS_TEXT_LIMIT)) {
      throw new AiOutputError('hasil Threads terlalu panjang')
    }
    return { texts: revised }
  } catch (error) {
    console.error('[buat] AI Threads gagal:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}

/**
 * The Threads editor's autosave. An empty chain makes the post follow its caption again; without a post the first
 * save starts a new post for Threads only.
 */
export async function saveThreadItemsAction(input: unknown): Promise<ThreadItemsResult> {
  const t = await getTranslations('editor.threadsActions')

  const { userId } = await requireAccount()
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const postId = fields.postId === null ? null : isUuid(fields.postId) ? fields.postId : undefined
  if (postId === undefined) return { error: t('message3') }
  const parsed = parseThreadItems(fields.items)
  if ('error' in parsed) return parsed
  if (postId === null && parsed.items.length === 0) return { error: t('message4') }
  try {
    return { postId: await saveThreadItems(userId, postId, parsed.items) }
  } catch (error) {
    if (error instanceof PlatformError) return { error: error.message }
    console.error('[buat] rantai Threads gagal disimpan:', describeError(error))
    return { error: t('message5') }
  }
}
