/**
 * Copywriting rules for carousels, distilled from the owner's carousel knowledge base so posts aren't generic.
 * Kept short on purpose: it goes into every carousel request. The brand kit's voice wins over any wording here.
 */
import { DEFAULT_DENSITY, type TextDensity } from './density-options'
import { hookGuide } from './hook-guide'

export const HOOK_ARCHETYPES = {
  authority: 'Otoritas: buka dari pengalaman atau hasil nyata yang tertulis di topik atau fakta brand.',
  polarizing: 'Konfrontatif: pendapat tegas yang menantang anggapan pembaca tentang masalahnya.',
  story: 'Cerita: buka dengan pelajaran yang didapat dengan cara sulit, membuat penasaran kelanjutannya.',
  curiosity: 'Penasaran: buka celah informasi, misalnya alasan sebenarnya kenapa banyak orang gagal di topik ini.',
  contrarian: 'Kebalikan: solusinya ternyata lebih sederhana atau berlawanan dengan yang umum dikira.',
} as const

/** Auto lets the writer choose by topic, audience and available evidence within the same request. */
export type HookArchetype = keyof typeof HOOK_ARCHETYPES | 'auto'

export const COVER_RULE =
  'Hook slide 1: satu hook 3–7 kata yang menyebut masalah, manfaat, atau pertanyaan spesifik dan memberi alasan untuk menggeser. Bukan sekadar judul topik. Tambahkan subheading opsional satu kalimat pendek (maksimal 12 kata) hanya jika memberi konteks atau membuka rasa penasaran yang mengarah alami ke slide 2; kosongkan jika hook sudah kuat. Subheading tidak boleh mengulang hook, membocorkan seluruh jawaban, menjadi CTA generik, atau membuat klaim baru. Tanpa paragraf penjelasan, bullet, contoh, tips, atau CTA. Aturan ini berlaku pada semua pilihan kepadatan teks.'

const INNER_SLIDE: Record<TextDensity, string> = {
  padat:
    'Tulis padat: subjudul lalu 2–3 poin sangat singkat (masing-masing beberapa kata), tanpa kalimat penjelasan dan tanpa singkatan, dan tetap masuk akal kalau dibaca sendirian.',
  ringkas:
    'Tulis ringkas: subjudul, satu kalimat penjelasan, lalu 2–3 poin singkat, tanpa singkatan, dan tetap masuk akal kalau dibaca sendirian.',
  seimbang:
    'Tulis seimbang: subjudul, 1–2 kalimat penjelasan, lalu 2–4 poin atau contoh konkret, tanpa singkatan, dan tetap masuk akal kalau dibaca sendirian.',
  lengkap:
    'Jelaskan sampai pembaca benar-benar paham: subjudul lalu 2–3 kalimat lengkap atau 3–5 poin, tanpa singkatan, dan tetap masuk akal kalau dibaca sendirian.',
}

const DENSITY_RULE: Record<TextDensity, string> = {
  padat:
    'Kepadatan teks: padat. Judul dan poin kunci saja, sekitar 60–120 karakter. Jangan tulis kalimat penjelasan.',
  ringkas:
    'Kepadatan teks: ringkas. Judul, satu kalimat, dan beberapa poin pendek, sekitar 120–200 karakter.',
  seimbang:
    'Kepadatan teks: seimbang. Judul, 1–2 kalimat, dan beberapa poin atau contoh konkret, sekitar 180–250 karakter. Tanpa baris Tips.',
  lengkap:
    'Kepadatan teks: lengkap, tidak dipadatkan. Teks di gambar boleh memuat penjelasan utuh, contoh, dan tips, sampai batas karakter slide.',
}

/** Density controls explanations, never the carousel's cover or closing action. */
export const densityRule = (density: TextDensity, scope: 'carousel' | 'single' = 'carousel') =>
  `${scope === 'carousel' ? 'Berlaku hanya untuk slide isi; cover dan CTA mengikuti aturan perannya, bukan target panjang ini.' : 'Berlaku untuk teks pada satu gambar ini.'} ${DENSITY_RULE[density]}`

/** A single post's density is only a default: text the owner already wrote for the image is never shortened. */
export const singleDensityRule = (density: TextDensity) =>
  `Kalau topik sudah memuat teks yang harus tampil di gambar, salin semuanya dan abaikan target panjang ini. Kalau belum, tulis teksnya sendiri: ${DENSITY_RULE[density]}`

/** A useful narrative for every supported slide count; short carousels merge roles instead of adding filler. */
export function carouselStructure(slides: number): string {
  if (slides <= 1) return ''
  if (slides === 2) return 'slide 1 = Hook; slide 2 = Value + CTA'
  if (slides === 3) return 'slide 1 = Hook; slide 2 = Value; slide 3 = CTA'
  if (slides === 4) return 'slide 1 = Hook; slide 2 = Bridge; slide 3 = Value; slide 4 = CTA'
  if (slides === 5) return 'slide 1 = Hook; slide 2 = Bridge; slide 3 = Problem/Reframe; slide 4 = Value/Proof; slide 5 = CTA'
  if (slides === 6) return 'slide 1 = Hook; slide 2 = Bridge; slide 3 = Problem; slide 4 = Reframe/Value; slide 5 = Recap/Proof; slide 6 = CTA'
  if (slides === 7) return 'slide 1 = Hook; slide 2 = Bridge; slide 3 = Problem; slide 4 = Reframe; slide 5 = Value; slide 6 = Recap/Proof; slide 7 = CTA'
  if (slides === 8) return 'slide 1 = Hook; slide 2 = Bridge; slide 3 = Problem; slide 4 = Reframe; slide 5–6 = Value; slide 7 = Recap/Proof; slide 8 = CTA'
  if (slides === 9) return 'slide 1 = Hook; slide 2 = Bridge; slide 3 = Problem; slide 4 = Reframe; slide 5–6 = Value; slide 7 = Proof; slide 8 = Recap; slide 9 = CTA'
  return `slide 1 = Hook; slide 2 = Bridge; slide 3 = Problem; slide 4 = Reframe; slide 5–${slides - 3} = Value; slide ${slides - 2} = Proof; slide ${slides - 1} = Recap; slide ${slides} = CTA`
}

/** The rules for a carousel, with the hook archetype this post uses and how much text its slides carry. */
export function carouselGuide(hook: HookArchetype = 'auto', density: TextDensity = DEFAULT_DENSITY, slides?: number): string {
  return [
    'Panduan carousel (wajib):',
    `- ${COVER_RULE}`,
    hookGuide(),
    ...(hook === 'auto' ? [] : [`- Arah struktur yang diminta: ${HOOK_ARCHETYPES[hook]} Gunakan hanya jika sesuai konteks dan bukti; gaya bahasa tetap mengikuti brand.`]),
    ...(slides ? [`- Struktur ${slides} slide: ${carouselStructure(slides)}.`] : []),
    '- Peran struktur: Bridge menghubungkan hook ke konteks dan menjelaskan mengapa topik penting; Problem menunjukkan masalah, penyebab, atau dampak; Reframe memberi cara pandang baru; Value membayar janji hook dengan langkah, poin, atau framework yang dapat dipakai; Proof memakai contoh, demonstrasi, data, before/after, atau pengalaman yang benar-benar tersedia; Recap merangkum inti; CTA meminta tepat satu tindakan.',
    '- Jangan memaksakan peran yang tidak mendapat slide sendiri. Jika dua peran digabung, satu slide harus menjalankan keduanya secara ringkas. Jangan menambah klaim atau filler hanya untuk memenuhi struktur.',
    '- Slide 2 mulai membayar janji hook tanpa basa-basi. Hook menyebut "5 cara" berarti Value harus memberikan 5 cara lengkap.',
    `- Tiap slide isi berisi satu hal yang bisa langsung dipakai pembaca (langkah konkret, contoh kalimat, checklist, angka dari topik), bukan sekadar nama konsep. ${INNER_SLIDE[density]}`,
    slides === 2
      ? '- Carousel 2 slide: slide 2 adalah Value + CTA; jawaban atau isi wajib membayar hook, lalu boleh ditutup satu ajakan singkat.'
      : '- Slide CTA: tepat satu ajakan singkat yang paling cocok dengan topik (follow, simpan, bagikan, komentar, atau link di bio), bukan gabungan. Tidak perlu paragraf, daftar contoh, atau tips untuk memenuhi kepadatan.',
    '- Hindari isi generik: kalau slide tetap masuk akal untuk topik lain, tulis ulang lebih spesifik. Jangan pakai frasa kosong seperti "game changer", "next level", "ubah segalanya", "solusi yang berhasil". Jangan ulangi pola kalimat yang sama di slide berbeda.',
    '- Pakai satu gaya sapaan secara konsisten, mengikuti gaya bahasa brand kalau ada.',
    '- Caption mendukung slide, bukan menyalin semua isinya.',
    '- Sebelum menjawab, periksa: cover memakai hook 3–7 kata yang spesifik dan sesuai suara brand; subheading hanya ada bila membantu dan tetap pendek; isi membayar janji hook dan mengikuti kepadatan; tidak ada klaim tanpa bukti. Tulis ulang bagian yang belum memenuhi, lalu keluarkan hanya JSON akhir tanpa hasil pemeriksaan.',
  ].join('\n')
}
