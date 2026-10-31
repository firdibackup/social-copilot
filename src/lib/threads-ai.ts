import 'server-only'
import { AiOutputError, describeBrand, loadBrandContext, quote, readJson, runLogged, snippetOf } from './ai'
import type { BrandContext } from './brand-options'
import { chatCompletion, type ChatMessage } from './nine-router'
import { MAX_THREAD_ITEMS, THREADS_TEXT_LIMIT } from './thread-items'

const NO_INVENTED_CLAIMS = 'Jangan menambah klaim seperti stok terbatas, promo terbatas, atau kualitas premium.'
const THREAD_SYSTEM = [
  'Kamu penulis Threads untuk satu akun bisnis atau kreator di Indonesia.',
  'Aturan:',
  '- Tulis dalam Bahasa Indonesia yang natural dan conversational, kecuali topik jelas memakai bahasa lain.',
  '- Buat post pendek dan enak dibaca. Post pertama harus menjadi hook yang membuat orang berhenti menggulir.',
  `- Setiap post wajib berisi teks dan maksimal ${THREADS_TEXT_LIMIT} karakter menurut batas Threads.`,
  '- Jangan pakai Markdown seperti **tebal**, _miring_, atau judul.',
  '- Hindari spam hashtag; gunakan maksimal 1 hashtag topik di seluruh rantai.',
  '- Jangan mengarang fakta atau klaim yang tidak ada di topik, rantai lama, atau fakta brand.',
  '- Balas HANYA dengan satu objek JSON sesuai format yang diminta, tanpa teks lain.',
].join('\n')

const chainText = (texts: readonly string[]) => texts.map((item, index) => `Post #${index + 1}:\n${quote(item)}`).join('\n\n')

export function buildThreadWriteMessages(topic: string, brand: BrandContext | null): ChatMessage[] {
  return [
    { role: 'system', content: THREAD_SYSTEM },
    {
      role: 'user',
      content: [
        `${brand ? describeBrand(brand) : ''}Tugas: tulis satu rantai Threads baru dari topik owner di bawah.`,
        `Buat 1–${MAX_THREAD_ITEMS} post. Post pertama adalah hook; post berikutnya mengembangkan satu alur yang utuh tanpa pengulangan atau filler.`,
        'Format JSON: {"posts": ["…"]}',
        '',
        `Topik owner:\n${quote(topic)}`,
        '',
        `Hanya pakai fakta dari ${brand?.facts ? 'topik dan fakta brand di atas' : 'topik di atas'}. ${NO_INVENTED_CLAIMS}`,
      ].join('\n'),
    },
  ]
}

export function buildThreadEditMessages(
  texts: string[],
  instruction: string,
  target: number | null,
  brand: BrandContext | null,
): ChatMessage[] {
  const task = target === null
    ? `Tugas: ubah seluruh rantai Threads sesuai permintaan owner. Boleh menambah atau mengurangi post, tetapi hasil harus 1–${MAX_THREAD_ITEMS} post dan tetap menjadi satu alur yang utuh.`
    : `Tugas: tulis ulang hanya Post #${target + 1} sesuai permintaan owner. Gunakan seluruh rantai sebagai konteks, jangan ubah post lain, dan balas dengan tepat satu post.`
  return [
    { role: 'system', content: THREAD_SYSTEM },
    {
      role: 'user',
      content: [
        `${brand ? describeBrand(brand) : ''}${task}`,
        'Format JSON: {"posts": ["…"]}',
        '',
        `Permintaan owner:\n${quote(instruction)}`,
        '',
        `Rantai sekarang:\n${chainText(texts)}`,
        '',
        `Pertahankan fakta rantai lama dan ${brand?.facts ? 'fakta brand' : 'jangan tambahkan fakta baru'}, kecuali owner meminta menghapusnya. ${NO_INVENTED_CLAIMS}`,
      ].join('\n'),
    },
  ]
}

/** A complete, non-empty Threads answer. Length repair is done by the action, which knows the final chain capacity. */
export function parseThreadAnswer(content: string): string[] {
  const posts = readJson(content)?.posts
  if (!Array.isArray(posts) || posts.length < 1 || posts.length > MAX_THREAD_ITEMS) {
    throw new AiOutputError(snippetOf(content))
  }
  const parsed = posts.map((post) => typeof post === 'string' ? post.replace(/\r\n/g, '\n').trim() : '')
  if (parsed.some((post) => !post)) throw new AiOutputError(snippetOf(content))
  return parsed
}

/** A new Threads chain from one topic; it only fills the editor. */
export function writeThread(userId: string, topic: string): Promise<string[]> {
  return runLogged(userId, 'threads_write', { topic }, async () => {
    const brand = await loadBrandContext(userId)
    return parseThreadAnswer(await chatCompletion(buildThreadWriteMessages(topic, brand)))
  })
}

/** A whole-chain or single-post Threads rewrite; it only fills the editor. */
export function editThread(
  userId: string,
  texts: string[],
  instruction: string,
  target: number | null,
): Promise<string[]> {
  const input = { posts: texts.length, instruction, target }
  return runLogged(userId, 'threads_edit', input, async () => {
    const brand = await loadBrandContext(userId)
    const answer = parseThreadAnswer(await chatCompletion(buildThreadEditMessages(texts, instruction, target, brand)))
    if (target !== null && answer.length !== 1) throw new AiOutputError(`diharapkan 1 post, diterima ${answer.length}`)
    return answer
  })
}

