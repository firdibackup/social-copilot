import { getTranslations } from 'next-intl/server'
import { getUserLocale, type Locale } from '@/i18n/locale'
import { after } from 'next/server'
import { aiErrorMessage, AiLimitError } from '@/lib/ai'
import { currentPeriod, currentUser } from '@/lib/auth'
import { addMessage, createSession, getSession, loadHistory, reserveDailyUsage, type ChatSession } from '@/lib/chat'
import { answerChat, persistableParts, summarizeChat, type UserTurn } from '@/lib/chat-ai'
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
import { getConnectedAccountId } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { PdfError, readPdfText } from '@/lib/pdf-text'
import { SlideImageError, toReferenceDataUrl } from '@/lib/slide-image'

/** The shared answer deadline leaves room inside this ceiling for persistence and an optional bounded summary. */
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
 * One message to Mimo. A route rather than a server action: the answer streams a line per tool as it starts
 * (NDJSON ChatEvents), and actions run one at a time per page, so the session list would wait behind it.
 */
export async function POST(request: Request): Promise<Response> {
  const t = await getTranslations('mimo.api')
  const locale = await getUserLocale()
  const user = await currentUser()
  if (!user) return refuse(401, t('sessionExpired'))
  if (!(await currentPeriod(user.id))) return refuse(403, t('subscription'))
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
  let history
  let userMessage
  try {
    if (!session) {
      const firstName = upload.parts.find((part) => part.type === 'attachment')
      session = await createSession(userId, accountId, sessionTitle(upload.turn.text, firstName?.type === 'attachment' ? firstName.name : '', locale))
      created = true
    }
    history = await loadHistory(session)
    userMessage = await addMessage(userId, session.id, { role: 'user', content, parts: upload.parts })
  } catch (error) {
    console.error('[mimo] pesan gagal disimpan:', describeError(error))
    return refuse(500, t('saveError'))
  }

  const chat = session
  const firstUser = userMessage
  const past = history
  // Runs once the stream has closed, so the new answer is counted.
  after(() =>
    summarizeChat(userId, chat, locale).catch((error: unknown) => console.error('[mimo] ringkasan gagal:', describeError(error))),
  )

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // The owner left the page; the answer is still stored below.
        }
      }
      try {
        const reply = await answerChat({
          userId,
          accountId,
          session: chat,
          history: past,
          turn: upload.turn,
          deepSearch,
          language: locale,
          onTool: (name) => send({ type: 'tool', name }),
        })
        const assistant = await addMessage(userId, chat.id, { role: 'assistant', content: reply.content, parts: persistableParts(reply.parts) })
        // The live response may show signed avatars; the stored message deliberately does not.
        send({ type: 'done', sessionId: chat.id, created, user: firstUser, assistant: { ...assistant, parts: reply.parts } })
      } catch (error) {
        console.error('[mimo] jawaban gagal disimpan:', describeError(error))
        send({ type: 'error', sessionId: chat.id, message: t('replySaveError') })
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
