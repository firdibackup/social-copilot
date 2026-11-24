import { getTranslations } from 'next-intl/server'
import { getUserLocale, type Locale } from '@/i18n/locale'
import { aiErrorMessage, AiLimitError } from '@/lib/ai'
import { currentUser } from '@/lib/auth'
import { addMessage, createSession, getSession, reserveDailyUsage, type ChatSession } from '@/lib/chat'
import type { UserTurn } from '@/lib/chat-ai'
import { enqueueChatJob, followChatJob, getActiveChatJob } from '@/lib/chat-jobs'
import {
  attachmentsProblem,
  checkAttachment,
  limitMessage,
  LIMIT_MESSAGES,
  MESSAGE_MAX_LENGTH,
  pdfPlaceholder,
  sessionTitle,
  type ChatEvent,
  type ChatPart,
} from '@/lib/chat-options'
import { getContentLanguage } from '@/lib/brand'
import { getConnectedAccountId } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { PdfError, readPdfText } from '@/lib/pdf-text'
import { SlideImageError, toReferenceDataUrl } from '@/lib/slide-image'

/** The worker makes the answer; a response here only follows the job, and stops before this ceiling (the chat follows again). */
export const maxDuration = 300

const NO_STORE = { 'cache-control': 'no-store' }

const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: NO_STORE })

class InputError extends Error {
  override name = 'InputError'
}

interface Upload {
  turn: UserTurn
  parts: ChatPart[]
}

/** The attachments, checked again here (the browser's checks can be skipped) and read for this one request. */
async function readUploads(files: File[], text: string, locale: Locale): Promise<Upload> {
  const checked = files.map((file) => ({ file, check: checkAttachment(file, locale) }))
  for (const { check } of checked) if ('error' in check) throw new InputError(check.error)
  const kinds = checked.map(({ check }) => ('kind' in check ? check.kind : 'image'))
  const problem = attachmentsProblem(kinds, locale)
  if (problem) throw new InputError(problem)

  const turn: UserTurn = { text, images: [], pdf: null }
  const parts: ChatPart[] = []
  for (const [index, { file }] of checked.entries()) {
    const kind = kinds[index]
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (kind === 'pdf') {
      const pdf = await readPdfText(bytes, file.name)
      turn.pdf = { name: file.name, text: pdf.text, cut: pdf.cut }
    } else {
      turn.images.push(await toReferenceDataUrl(bytes))
    }
    parts.push({ type: 'attachment', kind, name: file.name, size: file.size })
  }
  return { turn, parts }
}

/**
 * One message to Mimo. The message is stored and queued; the worker answers it (chat-jobs.ts). A route rather than a
 * server action: the response follows the job with a line per tool as it starts (NDJSON ChatEvents), and actions
 * run one at a time per page, so the session list would wait behind it.
 */
export async function POST(request: Request): Promise<Response> {
  const t = await getTranslations('mimo.api')
  const locale = await getUserLocale()
  const user = await currentUser()
  if (!user) return refuse(401, t('sessionExpired'))
  const accountId = await getConnectedAccountId(user.id)
  if (!accountId) return refuse(409, t('connect'))
  const userId = user.id

  let session: ChatSession | null = null
  let upload: Upload
  let deepSearch: boolean
  try {
    const form = await request.formData().catch(() => {
      throw new InputError(t('unreadable'))
    })
    const rawText = form.get('text')
    const text = (typeof rawText === 'string' ? rawText : '').replace(/\r\n/g, '\n').trim()
    const sessionId = form.get('sessionId')
    deepSearch = form.get('deepSearch') === '1'
    const files = form.getAll('files').filter((value): value is File => value instanceof File)
    if (!text && files.length === 0) throw new InputError(t('emptyMessage'))
    if (text.length > MESSAGE_MAX_LENGTH) throw new InputError(t('messageLength', { count: MESSAGE_MAX_LENGTH }))
    if (sessionId) {
      if (!isUuid(sessionId)) throw new InputError(t('conversationMissing'))
      session = await getSession(userId, accountId, sessionId)
      if (!session) return refuse(404, t('deletedConversation'))
      // One answer at a time per conversation, so the answers keep their order.
      if (await getActiveChatJob(userId, session.id)) return refuse(409, t('stillAnswering'))
    }
    // Reserve after cheap form validation but before expensive PDF/image processing or any persistence.
    await reserveDailyUsage(userId, 'chat')
    upload = await readUploads(files, text, locale)
  } catch (error) {
    if (error instanceof InputError || error instanceof PdfError) return refuse(400, error.message)
    if (error instanceof SlideImageError) return refuse(400, t('imageError'))
    if (error instanceof AiLimitError) return refuse(429, error.message === LIMIT_MESSAGES.chat ? limitMessage('chat', locale) : error.message)
    console.error('[mimo] pesan gagal diterima:', describeError(error))
    return refuse(500, aiErrorMessage(error))
  }

  const pdfName = upload.turn.pdf?.name
  const content = [upload.turn.text, pdfName ? pdfPlaceholder(pdfName) : ''].filter(Boolean).join('\n')
  let created = false
  let userMessage
  try {
    if (!session) {
      const firstName = upload.parts.find((part) => part.type === 'attachment')
      session = await createSession(userId, accountId, sessionTitle(upload.turn.text, firstName?.type === 'attachment' ? firstName.name : '', locale))
      created = true
    }
    userMessage = await addMessage(userId, session.id, { role: 'user', content, parts: upload.parts })
  } catch (error) {
    console.error('[mimo] pesan gagal disimpan:', describeError(error))
    return refuse(500, t('saveError'))
  }

  // The worker answers: the message is queued, and this response only follows the job. Closing the tab loses
  // nothing; the chat picks the job up again when it is opened.
  let jobId: string
  try {
    jobId = await enqueueChatJob(userId, accountId, session.id, userMessage.id, {
      turn: upload.turn,
      deepSearch,
      language: locale,
      contentLanguage: await getContentLanguage(userId, accountId, locale),
      created,
    })
  } catch (error) {
    console.error('[mimo] pesan gagal diantrekan:', describeError(error))
    return refuse(500, t('saveError'))
  }
  return follow(userId, jobId, t('replySaveError'), request.signal, { type: 'job', id: jobId, sessionId: session.id })
}

/** The NDJSON stream of a job's events, optionally after a first event. */
function follow(userId: string, jobId: string, failed: string, signal: AbortSignal, first?: ChatEvent): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // The owner left the page; the worker still stores the answer.
        }
      }
      try {
        if (first) send(first)
        await followChatJob(userId, jobId, send, failed, signal)
      } catch (error) {
        // Following failed, not the job: the stream ends without a last event and the chat follows again.
        console.error('[mimo] pekerjaan gagal diikuti:', describeError(error))
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed by a cancelled request.
        }
      }
    },
  })
  return new Response(stream, { headers: { ...NO_STORE, 'content-type': 'application/x-ndjson; charset=utf-8' } })
}

/** Follows a job again: after a reload, another tab, or a connection that was cut (`?job=<id>`). */
export async function GET(request: Request): Promise<Response> {
  const t = await getTranslations('mimo.api')
  const user = await currentUser()
  if (!user) return refuse(401, t('sessionExpired'))
  const jobId = new URL(request.url).searchParams.get('job')
  if (!isUuid(jobId)) return refuse(400, t('conversationMissing'))
  return follow(user.id, jobId, t('replySaveError'), request.signal)
}
