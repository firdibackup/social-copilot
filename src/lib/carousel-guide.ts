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

/** The register testers asked for: not document-stiff, not chat-casual. The brand's own voice still sets sapaan. */
export const VOICE_RULE =
  'Gaya bahasa semi-formal yang mengalir, seperti praktisi yang menjelaskan ke klien atau rekan kerja: kalimat aktif dan pendek, kata sehari-hari yang tetap sopan. Hindari bahasa kaku khas dokumen (merupakan, adalah sebuah, dalam rangka, guna, sebagaimana, hal ini, oleh karena itu, dapat dilakukan) dan hindari bahasa terlalu santai (gue/lo, wkwk, slang, singkatan chat, emoji berlebihan). Sapaan dan tingkat formalitas mengikuti gaya bahasa brand: brand formal tetap dibuat luwes, brand santai tetap rapi.'

/** Hooks came out as generic yes/no questions ("Mencari hunian di X?"); this asks for a concrete promise. */
export const HOOK_QUALITY_RULE =
  'Hook harus spesifik dan membuat orang berhenti menggulir: sebut objek, angka, kesalahan, kontras, atau hasil konkret yang benar-benar dibahas di isi. Hindari pertanyaan ya/tidak yang umum ("Mencari rumah?", "Ingin sukses?", "Butuh X?") dan hook yang hanya nama topik. Pikirkan 3 calon hook, lalu pakai yang paling spesifik dan paling membuat pembaca ingin menggeser.'

/**
 * Ideas came out as the brand's feature list (PARKSPRING test, 8 Nov): every pillar as a catalogue, the same
 * format five times, the strongest fact (flood-free, real promo numbers) unused.
 */
export const IDEA_QUALITY_RULE =
  'Kualitas ide: mulai dari sudut pandang audiens (masalah, kekhawatiran, pertanyaan, atau keinginan mereka), bukan daftar fitur brand. Prioritaskan fakta brand yang paling kuat dan paling membedakan (angka, hasil, harga, promo, keunggulan yang tidak dimiliki pesaing) sebagai hook. Variasikan format antar ide, mis. checklist, perbandingan, mitos vs fakta, simulasi biaya atau angka, tanya jawab, sebelum–sesudah, cerita keseharian; jangan dua ide dengan format yang sama dalam satu daftar. Kata atau frasa khas brand dipakai sesekali sebagai warna, bukan wajib di setiap hook atau CTA.'

export const COVER_RULE =
  'Hook slide 1: satu hook 5–10 kata yang langsung dipahami tanpa konteks lain: sebut subjeknya (produk, tempat, atau topik) bersama masalah, manfaat, kontras, atau pertanyaan spesifik yang memberi alasan untuk menggeser. Jangan pangkas hook sampai tinggal kata sifat atau daftar kata tanpa subjek (mis. "Aman, aktif, dan berkumpul"). Bukan sekadar judul topik. Tambahkan subheading satu kalimat pendek (maksimal 14 kata) yang memberi konteks atau membuka rasa penasaran ke slide 2; kosongkan hanya jika hook sudah lengkap konteksnya. Subheading tidak boleh mengulang hook, membocorkan seluruh jawaban, menjadi CTA generik, atau membuat klaim baru. Tanpa paragraf penjelasan, bullet, contoh, tips, atau CTA. Aturan ini berlaku pada semua pilihan kepadatan teks.'

const INNER_SLIDE: Record<TextDensity, string> = {
  padat:
    'Tulis padat: subjudul lalu 2–3 poin sangat singkat (masing-masing beberapa kata), tanpa kalimat penjelasan dan tanpa singkatan, dan tetap masuk akal kalau dibaca sendirian.',
  ringkas:
    'Tulis ringkas: subjudul, satu kalimat penjelasan ATAU 2–3 poin singkat, tanpa singkatan, dan tetap masuk akal kalau dibaca sendirian.',
  seimbang:
    'Tulis seimbang: subjudul, 1–2 kalimat penjelasan ATAU 2–4 poin atau contoh konkret, tanpa singkatan, dan tetap masuk akal kalau dibaca sendirian.',
  lengkap:
    'Jelaskan sampai pembaca benar-benar paham: subjudul lalu 2–3 kalimat lengkap atau 3–5 poin, tanpa singkatan, dan tetap masuk akal kalau dibaca sendirian.',
}

const DENSITY_RULE: Record<TextDensity, string> = {
  padat:
    'Kepadatan teks: padat. Judul dan poin kunci saja, sekitar 60–120 karakter. Jangan tulis kalimat penjelasan.',
  ringkas:
    'Kepadatan teks: ringkas. Judul dan satu kalimat atau beberapa poin pendek, sekitar 120–200 karakter.',
  seimbang:
    'Kepadatan teks: seimbang. Judul dan 1–2 kalimat atau beberapa poin konkret, sekitar 180–250 karakter. Tanpa baris Tips.',
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
  if (slides <= 1) return 'satu gambar: hook sebagai judul, lalu isi inti yang langsung bermanfaat'
  if (slides === 2) return 'slide 1 = Hook; slide 2 = Value + CTA'
  if (slides === 3) return 'slide 1 = Hook; slide 2 = Value; slide 3 = CTA'
  return `slide 1 = Hook; slide 2–${slides - 1} = Value (poin berbeda yang langsung membayar hook); slide ${slides} = CTA`
}

/** The rules for a carousel, with the hook archetype this post uses and how much text its slides carry. */
export function carouselGuide(hook: HookArchetype = 'auto', density: TextDensity = DEFAULT_DENSITY, slides?: number): string {
  return [
    'Panduan carousel (wajib):',
    `- ${COVER_RULE}`,
    hookGuide(),
    `- ${HOOK_QUALITY_RULE}`,
    ...(hook === 'auto' ? [] : [`- Arah struktur yang diminta: ${HOOK_ARCHETYPES[hook]} Gunakan hanya jika sesuai konteks dan bukti; gaya bahasa tetap mengikuti brand.`]),
    ...(slides ? [`- Struktur ${slides} slide: ${carouselStructure(slides)}.`] : []),
    '- Peran struktur: Bridge menghubungkan hook ke konteks dan menjelaskan mengapa topik penting; Problem menunjukkan masalah, penyebab, atau dampak; Reframe memberi cara pandang baru; Value membayar janji hook dengan langkah, poin, atau framework yang dapat dipakai; Proof memakai contoh, demonstrasi, data, before/after, atau pengalaman yang benar-benar tersedia; Recap merangkum inti; CTA meminta tepat satu tindakan.',
    '- Isi yang singkat tidak perlu dipanjangkan: kalau poin berbeda habis, gabungkan peran dan pakai slide lebih sedikit, bukan mengulang poin dengan kata lain.',
    '- Uji manfaat setiap kalimat: hapus nasihat yang sudah jelas seperti "sesuaikan dengan kebutuhan", "pilih sesuai rencana", "atur waktunya", atau "mulai dari waktu tersedia" kecuali diikuti cara memilih yang konkret. Dua fasilitas tidak otomatis perlu dua slide: satukan bila hanya menjelaskan fungsi. Tambah slide hanya untuk keputusan, langkah, atau bukti yang berbeda.',
    '- Hook menjanjikan manfaat editorial yang benar-benar diberikan isi (mis. cara memilih kegiatan atau hal yang dicek saat survei), bukan janji hasil produk. CTA harus menyebut tindakan dan objek konkret; "kenali fasilitas" saja belum cukup.',
    '- Jangan buat slide yang hanya menyebut daftar kriteria, pertanyaan, atau poin yang baru dijawab di slide berikutnya: gabungkan pertanyaan dan jawabannya di satu slide.',
    '- Jangan memaksakan peran yang tidak mendapat slide sendiri. Jika dua peran digabung, satu slide harus menjalankan keduanya secara ringkas. Jangan menambah klaim atau filler hanya untuk memenuhi struktur.',
    '- Slide 2 mulai membayar janji hook tanpa basa-basi. Hook menyebut "5 cara" berarti Value harus memberikan 5 cara lengkap.',
    '- Janji hook wajib dibuktikan secara konkret: "bandingkan A dan B" berarti ada slide perbandingan berdampingan dengan kriteria yang sama (mis. waktu, biaya, risiko); "apa artinya" berarti ada jawaban nyata, bukan ajakan untuk memikirkannya.',
    '- Tiap slide isi membawa informasi baru yang belum ada di slide lain: jangan ulangi poin, manfaat, atau kalimat yang sama dengan kata berbeda. Hindari poin kosong seperti "pertimbangkan kenyamanan" atau "pikirkan kebutuhan Anda"; ganti dengan fakta, angka, contoh, atau langkah yang bisa langsung dipakai.',
    '- Angka di hook (mis. "3 hal") wajib sama dengan jumlah poin yang benar-benar terisi dari fakta yang tersedia. Kalau fakta untuk salah satu poin tidak ada, kurangi angkanya atau hapus angka dari hook, jangan mengarang.',
    `- Tiap slide isi berisi satu hal yang bisa langsung dipakai pembaca (langkah konkret, contoh kalimat, checklist, angka dari topik), bukan sekadar nama konsep. ${INNER_SLIDE[density]}`,
    slides === 2
      ? '- Carousel 2 slide: slide 2 adalah Value + CTA; jawaban atau isi wajib membayar hook, lalu boleh ditutup satu ajakan singkat.'
      : '- Slide CTA: tepat satu ajakan singkat yang paling cocok dengan topik (follow, simpan, bagikan, komentar, atau link di bio), bukan gabungan. Tidak perlu paragraf, daftar contoh, atau tips untuk memenuhi kepadatan.',
    '- Hindari isi generik: kalau slide tetap masuk akal untuk topik lain, tulis ulang lebih spesifik. Jangan pakai frasa kosong seperti "game changer", "next level", "ubah segalanya", "solusi yang berhasil". Jangan ulangi pola kalimat yang sama di slide berbeda.',
    '- Pakai satu gaya sapaan secara konsisten, mengikuti gaya bahasa brand kalau ada.',
    '- Caption mendukung slide, bukan menyalin semua isinya.',
    '- Sebelum menjawab, periksa: cover memakai hook 5–10 kata yang spesifik, menyebut subjeknya, dan sesuai suara brand; subheading hanya ada bila membantu dan tetap pendek; isi membayar janji hook dan mengikuti kepadatan; tidak ada klaim tanpa bukti. Tulis ulang bagian yang belum memenuhi, lalu keluarkan hanya JSON akhir tanpa hasil pemeriksaan.',
  ].join('\n')
}

/**
 * Two worked before/after scripts: rules alone left scripts stiff and feature-listy (PARKSPRING tests, 21 Nov).
 * Fictional brands on purpose, so no fact leaks into a real account; the model copies the moves, not the words.
 */
export const SCRIPT_EXAMPLES = [
  'Contoh editorial (brand fiktif; tiru penalarannya, jangan pindahkan fakta atau kalimat ke akun lain):',
  'Fakta contoh: perumahan memiliki taman bermain dan jalur sepeda di dalam cluster. Tidak ada informasi bangku, keamanan, jarak antarfasilitas, atau pengawasan anak.',
  'Lemah: "Fasilitas Lengkap untuk Keluarga" / "Ada taman bermain dan jalur sepeda sebagai pilihan aktivitas." Hanya katalog; pembaca belum mendapat cara memilih.',
  'Lebih berguna: cover "Akhir pekan bersama anak, coba fasilitas dalam cluster"; isi "Pilih kegiatan, bukan sekadar fasilitas" + "Ingin bersepeda bersama? Coba jalur sepeda. Anak ingin bermain? Dampingi di taman bermain. Pilih salah satu untuk rencana akhir pekan."; penutup "Saat survei, coba rute menuju fasilitas" + "Perhatikan akses dari unit incaran dan apakah cocok dengan kegiatan keluarga Anda."',
  'Skenario memakai kata coba, bisa, atau misalnya: bukan testimoni penghuni, jaminan hasil, atau klaim semua kegiatan dapat dilakukan bersamaan. Jangan menambah fasilitas demi cerita.',
  'Contoh edukasi lintas bidang: lemah "Pilih paket sesuai kebutuhan". Lebih berguna "Sebelum berlangganan, cek tiga batas" + "Kuota dihitung per hari atau per bulan? Revisi ikut memotong kuota? Sisa kuota hangus atau dibawa?" Tidak perlu mengarang harga atau angka agar isi konkret.',
  'Ukuran layak: setelah membaca, audiens mendapat keputusan, langkah, pembeda, atau gambaran kegiatan yang tidak sudah habis dijelaskan di cover. CTA melanjutkan manfaat itu, bukan sekadar "kenali produk". Sesuaikan bentuk dengan fakta dan tujuan; jangan memaksakan pola contoh ke semua topik.',
].join('\n')
