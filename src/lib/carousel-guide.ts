/**
 * Copywriting rules for carousels, distilled from the owner's carousel knowledge base so posts aren't generic.
 * Kept short on purpose: it goes into every carousel request. The brand kit's voice wins over any wording here.
 */
import { DEFAULT_DENSITY, type TextDensity } from './density-options'

export const HOOK_ARCHETYPES = {
  authority: 'Otoritas: buka dari pengalaman atau hasil nyata yang tertulis di topik atau fakta brand.',
  polarizing: 'Konfrontatif: pendapat tegas yang menantang anggapan pembaca tentang masalahnya.',
  story: 'Cerita: buka dengan pelajaran yang didapat dengan cara sulit, membuat penasaran kelanjutannya.',
  curiosity: 'Penasaran: buka celah informasi, misalnya alasan sebenarnya kenapa banyak orang gagal di topik ini.',
  contrarian: 'Kebalikan: solusinya ternyata lebih sederhana atau berlawanan dengan yang umum dikira.',
} as const

export type HookArchetype = keyof typeof HOOK_ARCHETYPES

const ARCHETYPES = Object.keys(HOOK_ARCHETYPES) as HookArchetype[]

/** One archetype per request, picked at random so hooks vary between posts without storing which came last. */
export function pickHook(random: () => number = Math.random): HookArchetype {
  return ARCHETYPES[Math.min(Math.floor(random() * ARCHETYPES.length), ARCHETYPES.length - 1)]
}

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
    'Kepadatan teks: padat. Teks di gambar setiap slide sesingkat mungkin, judul dan poin kunci saja, sekitar 60–120 karakter. Jangan tulis kalimat penjelasan.',
  ringkas:
    'Kepadatan teks: ringkas. Teks di gambar setiap slide singkat: judul, satu kalimat, dan beberapa poin pendek, sekitar 120–200 karakter.',
  seimbang:
    'Kepadatan teks: seimbang. Teks di gambar setiap slide cukup untuk dipahami tanpa penuh: judul, 1–2 kalimat, dan beberapa poin atau contoh konkret, sekitar 180–250 karakter. Tanpa baris Tips.',
  lengkap:
    'Kepadatan teks: lengkap, tidak dipadatkan. Teks di gambar boleh memuat penjelasan utuh, contoh, dan tips, sampai batas karakter slide.',
}

/** How much text the owner wants on each slide's image, for every request that writes slide text. */
export const densityRule = (density: TextDensity) => DENSITY_RULE[density]

/** The rules for a carousel, with the hook archetype this post uses and how much text its slides carry. */
export function carouselGuide(hook: HookArchetype, density: TextDensity = DEFAULT_DENSITY): string {
  return [
    'Panduan carousel (wajib):',
    `- Hook slide 1: 3–7 kata, bicara langsung ke pembaca, dan buat pembaca merasa rugi atau ketinggalan sesuatu yang spesifik (hasil apa, ke siapa), bukan pernyataan netral. Gaya hook post ini: ${HOOK_ARCHETYPES[hook]}`,
    '- Slide 2 melanjutkan janji hook tanpa basa-basi. Slide isi membayar janji itu persis: hook menyebut "5 cara" berarti ada 5 cara lengkap.',
    `- Tiap slide isi berisi satu hal yang bisa langsung dipakai pembaca (langkah konkret, contoh kalimat, checklist, angka dari topik), bukan sekadar nama konsep. ${INNER_SLIDE[density]}`,
    '- Slide CTA: tepat satu ajakan yang paling cocok dengan topik (follow, simpan, bagikan, komentar, atau link di bio), bukan gabungan.',
    '- Hindari isi generik: kalau slide tetap masuk akal untuk topik lain, tulis ulang lebih spesifik. Jangan pakai frasa kosong seperti "game changer", "next level", "ubah segalanya", "solusi yang berhasil". Jangan ulangi pola kalimat yang sama di slide berbeda.',
    '- Pakai satu gaya sapaan secara konsisten, mengikuti gaya bahasa brand kalau ada.',
    '- Caption mendukung slide, bukan menyalin semua isinya.',
    '- Sebelum menjawab, periksa sendiri semua poin di atas dan perbaiki slide yang belum memenuhi. Jangan tulis hasil pemeriksaannya.',
  ].join('\n')
}
