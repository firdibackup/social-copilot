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
  'Hook slide 1: satu hook 3–7 kata yang menyebut masalah, manfaat, atau pertanyaan spesifik dan memberi alasan untuk menggeser. Bukan sekadar judul topik. Cover hanya hook, tanpa paragraf penjelasan, bullet, contoh, tips, atau CTA. Aturan ini berlaku pada semua pilihan kepadatan teks.'

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

/** The rules for a carousel, with the hook archetype this post uses and how much text its slides carry. */
export function carouselGuide(hook: HookArchetype = 'auto', density: TextDensity = DEFAULT_DENSITY, slides?: number): string {
  return [
    'Panduan carousel (wajib):',
    `- ${COVER_RULE}`,
    hookGuide(),
    ...(hook === 'auto' ? [] : [`- Arah struktur yang diminta: ${HOOK_ARCHETYPES[hook]} Gunakan hanya jika sesuai konteks dan bukti; gaya bahasa tetap mengikuti brand.`]),
    '- Slide 2 melanjutkan janji hook tanpa basa-basi. Slide isi membayar janji itu persis: hook menyebut "5 cara" berarti ada 5 cara lengkap.',
    `- Tiap slide isi berisi satu hal yang bisa langsung dipakai pembaca (langkah konkret, contoh kalimat, checklist, angka dari topik), bukan sekadar nama konsep. ${INNER_SLIDE[density]}`,
    slides === 2
      ? '- Carousel 2 slide: slide 2 wajib memuat jawaban atau isi yang membayar hook; boleh ditutup satu ajakan singkat, jangan diganti slide CTA saja.'
      : '- Slide CTA: tepat satu ajakan singkat yang paling cocok dengan topik (follow, simpan, bagikan, komentar, atau link di bio), bukan gabungan. Tidak perlu paragraf, daftar contoh, atau tips untuk memenuhi kepadatan. Jika hanya 2 slide, slide 2 wajib memuat isi yang membayar hook dan boleh ditutup satu ajakan singkat.',
    '- Hindari isi generik: kalau slide tetap masuk akal untuk topik lain, tulis ulang lebih spesifik. Jangan pakai frasa kosong seperti "game changer", "next level", "ubah segalanya", "solusi yang berhasil". Jangan ulangi pola kalimat yang sama di slide berbeda.',
    '- Pakai satu gaya sapaan secara konsisten, mengikuti gaya bahasa brand kalau ada.',
    '- Caption mendukung slide, bukan menyalin semua isinya.',
    '- Sebelum menjawab, periksa: cover hanya hook 3–7 kata, spesifik dan sesuai suara brand; tidak ada penjelasan di cover; isi membayar janji hook dan mengikuti kepadatan; tidak ada klaim tanpa bukti. Tulis ulang bagian yang belum memenuhi, lalu keluarkan hanya JSON akhir tanpa hasil pemeriksaan.',
  ].join('\n')
}
