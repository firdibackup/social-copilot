/**
 * Copywriting rules for carousels, distilled from the owner's carousel knowledge base so posts aren't generic.
 * Kept short on purpose: it goes into every carousel request. The brand kit's voice wins over any wording here.
 */

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

/** The rules for a carousel, with the hook archetype this post uses. */
export function carouselGuide(hook: HookArchetype): string {
  return [
    'Panduan carousel (wajib):',
    `- Hook slide 1: 3–7 kata, bicara langsung ke pembaca, dan buat pembaca merasa rugi atau ketinggalan sesuatu yang spesifik (hasil apa, ke siapa), bukan pernyataan netral. Gaya hook post ini: ${HOOK_ARCHETYPES[hook]}`,
    '- Slide 2 melanjutkan janji hook tanpa basa-basi. Slide isi membayar janji itu persis: hook menyebut "5 cara" berarti ada 5 cara lengkap.',
    '- Tiap slide isi berisi satu hal yang bisa langsung dipakai pembaca (langkah konkret, contoh kalimat, checklist, angka dari topik), bukan sekadar nama konsep. Jelaskan sampai pembaca benar-benar paham: subjudul lalu 2–3 kalimat lengkap atau 3–5 poin, tanpa singkatan, dan tetap masuk akal kalau dibaca sendirian.',
    '- Slide CTA: tepat satu ajakan yang paling cocok dengan topik (follow, simpan, bagikan, komentar, atau link di bio), bukan gabungan.',
    '- Hindari isi generik: kalau slide tetap masuk akal untuk topik lain, tulis ulang lebih spesifik. Jangan pakai frasa kosong seperti "game changer", "next level", "ubah segalanya", "solusi yang berhasil". Jangan ulangi pola kalimat yang sama di slide berbeda.',
    '- Pakai satu gaya sapaan secara konsisten, mengikuti gaya bahasa brand kalau ada.',
    '- Caption mendukung slide, bukan menyalin semua isinya.',
    '- Sebelum menjawab, periksa sendiri semua poin di atas dan perbaiki slide yang belum memenuhi. Jangan tulis hasil pemeriksaannya.',
  ].join('\n')
}
