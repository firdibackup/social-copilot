export type { Locale } from '@/i18n/locale-config'

/**
 * The language a brand's content is written in (Brand › Bahasa konten): Indonesian, English, or Indonesian mixed
 * with everyday English. It is apart from the language the owner reads the app in (Locale); a brand that has not
 * chosen follows that one. What the AI says to the owner (Mimo's replies, analyses, error messages) stays in Locale.
 */
export const CONTENT_LANGUAGES = ['id', 'en', 'mixed'] as const
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number]
export const isContentLanguage = (value: unknown): value is ContentLanguage =>
  typeof value === 'string' && (CONTENT_LANGUAGES as readonly string[]).includes(value)

const ENGLISH =
  'Write all output in English. This language rule overrides any Indonesian-language directions in the task, brand voice, history, or examples. Use natural, friendly English and address the reader as "you", not "kamu". Indonesian phrases in the instructions are style examples only: adapt them into English, never copy them into new content. This applies to captions, titles, slide text, descriptions, tags, analyses, summaries, replies, and human-readable tool arguments. Keep JSON keys, enum values, IDs, URLs, brand names, and explicitly quoted source text unchanged. Preserve approved script text that the task explicitly requires copying verbatim. Do not change the requested output format.'

/** Indonesian sentences with English words where urban Indonesian brands use them: never an English text. */
const MIXED =
  'Bahasa keluaran: campuran Indonesia dan Inggris, gaya brand urban Indonesia di Instagram. Aturan ini mengalahkan arahan "bahasa Indonesia" di tugas, suara brand, riwayat, dan contoh. Tata bahasa dan sebagian besar kata tetap bahasa Indonesia santai, tetapi setiap judul slide dan hampir setiap kalimat caption, skrip, atau ide WAJIB memuat minimal satu kata atau frasa bahasa Inggris yang lazim dipakai orang Indonesia sehari-hari, misalnya: deadline, mood, me time, worth it, simple, tips, relate, upgrade, daily, vibes, step by step, must try, real talk, save, share. Hook dan ajakan boleh berupa frasa Inggris pendek, misalnya "Real talk: lembur itu berat" atau "Save dulu, coba nanti". Contoh kalimat yang benar: "Tips simple biar pagi kamu lebih produktif". Semua contoh di sini hanya ilustrasi: pilih kata Inggris yang cocok dengan topiknya dan jangan mengulang frasa yang sama di setiap konten. Jangan menulis satu paragraf penuh dalam bahasa Inggris, jangan memaksakan kata Inggris yang terdengar tidak wajar, dan jangan menerjemahkan nama brand atau produk. Sapaan tetap "kamu". Kunci JSON, nilai enum, ID, URL, dan teks sumber yang dikutip tidak diubah. Teks skrip yang wajib disalin persis tetap disalin persis. Format keluaran tidak berubah.'

/** ID is intentionally a no-op: existing prompts (including whitespace) must not change. */
export function outputLanguageInstruction(language: ContentLanguage = 'id'): string {
  return language === 'en' ? ENGLISH : language === 'mixed' ? MIXED : ''
}

/** Localize only the language directive, not the task or its structured-data contract. */
export function languagePrompt(prompt: string, language: ContentLanguage = 'id'): string {
  if (language === 'id') return prompt
  // The mixed prompt stays Indonesian: only the directive is added.
  if (language === 'mixed') return `${prompt}\n\n${MIXED}`
  return `${prompt.replace(/bahasa Indonesia/gi, 'English')}\n\n${outputLanguageInstruction(language)}`
}
