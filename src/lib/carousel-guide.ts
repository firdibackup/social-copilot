/**
 * Copywriting rules for carousels, distilled from the owner's carousel knowledge base so posts aren't generic.
 * Kept short on purpose: it goes into every carousel request. The brand kit's voice wins over any wording here.
 */
import { DEFAULT_DENSITY, type TextDensity } from './density-options'
import { hookGuide, slideGuide, type HookTemplate } from './hook-guide'

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
  'Hook harus menampilkan satu hal nyata yang membuat orang berhenti menggulir: benda, kalimat persis, angka, adegan, atau kontras yang benar-benar dibahas di isi. Ujiannya: kalau hook itu masih cocok dipasang di brand lain, atau hanya menyebut kategori ("3 kesalahan…", "tips…", "cara memilih…"), tulis ulang. Hindari pertanyaan ya/tidak dan keluhan umum ("Mencari rumah?", "Bingung mulai dari mana?"). Pernyataan tegas, kutipan, atau perintah kecil lebih kuat daripada pertanyaan. Tulis 3 calon hook dengan mekanisme berbeda, lalu pakai yang paling tajam.'

/**
 * Ideas came out as the brand's feature list (PARKSPRING test, 8 Nov): every pillar as a catalogue, the same
 * format five times, the strongest fact (flood-free, real promo numbers) unused.
 */
export const IDEA_QUALITY_RULE =
  'Kualitas ide: mulai dari sudut pandang audiens (masalah, kekhawatiran, pertanyaan, atau keinginan mereka), bukan daftar fitur brand. Prioritaskan fakta brand yang paling kuat dan paling membedakan (angka, hasil, harga, promo, keunggulan yang tidak dimiliki pesaing) sebagai hook. Variasikan format antar ide, mis. checklist, perbandingan, mitos vs fakta, simulasi biaya atau angka, tanya jawab, sebelum–sesudah, cerita keseharian; jangan dua ide dengan format yang sama dalam satu daftar. Kata atau frasa khas brand dipakai sesekali sebagai warna, bukan wajib di setiap hook atau CTA.'

export const COVER_RULE =
  'Hook slide 1: satu hook 5–12 kata yang langsung dipahami tanpa konteks lain: sebut subjeknya (produk, tempat, atau topik) bersama masalah, manfaat, kontras, atau pertanyaan spesifik yang memberi alasan untuk menggeser. Jangan pangkas hook sampai tinggal kata sifat atau daftar kata tanpa subjek (mis. "Aman, aktif, dan berkumpul"). Bukan sekadar judul topik. Tambahkan subheading satu kalimat pendek (maksimal 14 kata) yang memberi konteks atau membuka rasa penasaran ke slide 2; kosongkan hanya jika hook sudah lengkap konteksnya. Subheading tidak boleh mengulang hook, membocorkan seluruh jawaban, menjadi CTA generik, atau membuat klaim baru. Tanpa paragraf penjelasan, bullet, contoh, tips, atau CTA. Aturan ini berlaku pada semua pilihan kepadatan teks.'

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
export function carouselGuide(hook: HookArchetype = 'auto', density: TextDensity = DEFAULT_DENSITY, slides?: number, hooks: HookTemplate[] = []): string {
  return [
    'Panduan carousel (wajib):',
    `- ${COVER_RULE}`,
    hookGuide(hooks),
    slideGuide(),
    `- ${HOOK_QUALITY_RULE}`,
    ...(hook === 'auto' ? [] : [`- Arah struktur yang diminta: ${HOOK_ARCHETYPES[hook]} Gunakan hanya jika sesuai konteks dan bukti; gaya bahasa tetap mengikuti brand.`]),
    ...(slides ? [`- Struktur ${slides} slide: ${carouselStructure(slides)}.`] : []),
    '- Peran struktur: Bridge menghubungkan hook ke konteks dan menjelaskan mengapa topik penting; Problem menunjukkan masalah, penyebab, atau dampak; Reframe memberi cara pandang baru; Value membayar janji hook dengan langkah, poin, atau framework yang dapat dipakai; Proof memakai contoh, demonstrasi, data, before/after, atau pengalaman yang benar-benar tersedia; Recap merangkum inti; CTA meminta tepat satu tindakan.',
    '- Isi yang singkat tidak perlu dipanjangkan: kalau poin berbeda habis, gabungkan peran dan pakai slide lebih sedikit, bukan mengulang poin dengan kata lain.',
    '- Uji manfaat setiap kalimat: hapus nasihat yang sudah jelas seperti "sesuaikan dengan kebutuhan", "pilih sesuai rencana", "atur waktunya", atau "mulai dari waktu tersedia" kecuali diikuti cara memilih yang konkret. Dua fasilitas tidak otomatis perlu dua slide: satukan bila hanya menjelaskan fungsi. Tambah slide hanya untuk keputusan, langkah, atau bukti yang berbeda.',
    '- Hook menjanjikan manfaat editorial yang benar-benar diberikan isi (mis. cara memilih kegiatan atau hal yang dicek saat survei), bukan janji hasil produk. CTA harus menyebut tindakan dan objek konkret; "kenali fasilitas" saja belum cukup.',
    '- Jangan buat slide yang hanya menyebut daftar kriteria, pertanyaan, atau poin yang baru dijawab di slide berikutnya: gabungkan pertanyaan dan jawabannya di satu slide.',
    '- Jangan memaksakan peran yang tidak mendapat slide sendiri. Jika dua peran digabung, satu slide harus menjalankan keduanya secara ringkas. Jangan menambah klaim atau filler hanya untuk memenuhi struktur.',
    '- Hook membahas masalah, situasi, atau keputusan pembaca, bukan memperkenalkan brand: "X, Y, Z: [brand] punya panduannya", "Kenali [layanan] kami", atau pengumuman produk bukan hook. Sebut nama brand atau produk di hook hanya kalau pembaca memang mencarinya.',
    '- Sebelum menulis slide isi, daftarkan dulu informasi BARU yang akan dibawa tiap slide (satu klaim + satu alasan, contoh angka, atau langkah). Slide yang informasinya sudah ada di slide lain dibuang, bukan dipoles ulang. Tiap slide isi wajib memuat satu "karena", "artinya", "misalnya", atau langkah yang bisa dicoba, bukan hanya label atau definisi.',
    '- Jumlah slide: 4–5 sebagai default. Pakai 6 atau lebih hanya kalau ada minimal 4 poin berbeda yang masing-masing punya fakta atau penjelasan sendiri. Slide tambahan yang mengulang poin sebelumnya, memuat promosi akun, atau menumpuk kredensial lebih buruk daripada carousel pendek.',
    '- Jangan membuat generalisasi tanpa dasar ("paling sering", "kebanyakan orang", "banyak pemula", "terbukti"). Alasan dan penjelasan harus pengetahuan umum yang pasti benar, bukan klaim tentang audiens atau hasil yang tidak ada di fakta.',
    '- Kalau suara brand memakai pengalaman pribadi atau cerita ("aku", "penulis"), pakai sudut itu di hook hanya dengan kejadian yang tertulis di fakta brand; kalau tidak ada, pakai sapaan ke pembaca. Jangan menyebut akun dari sudut orang ketiga.',
    '- CTA harus menyambung ke janji post ini: kalau isinya soal outfit, CTA tidak boleh melompat ke topik lain. Jangan memakai "follow untuk tips lainnya" atau CTA brand yang tidak berkaitan dengan isi slide.',
    '- Hook menyisakan satu hal untuk slide 2: jangan ucapkan seluruh kesimpulan atau seluruh perbedaan di hook. Slide 2 membuka bagian yang ditahan itu, lalu slide berikutnya menambah penjelasan, bukan mengulangnya.',
    '- Isi slide menjawab "kenapa" atau "bagaimana", bukan hanya "apa": pakai alasan, mekanisme, contoh angka, atau langkah, termasuk pengetahuan umum yang pasti benar. Angka atau frasa kunci dari hook cukup muncul sekali lagi sebagai bukti, bukan di setiap slide. Poin yang hanya mengulang judulnya ("Slime — bermain dengan slime", "Elevasi 3 meter / Di atas permukaan tanah") dilarang.',
    '- Kalau fakta brand tentang topik ini sedikit, buat carousel lebih pendek (3–4 slide) dan isi dengan penjelasan umum yang pasti benar atau contoh hitungan berlabel "misalnya". Jangan mengisi slide dengan pengulangan fakta yang sama.',
    '- Tulis untuk pembaca, bukan untuk pengelola akun: jangan sebut "caption", "fakta brand", "riset", "referensi", atau "tercantum di promo" di teks slide.',
    '- CTA mengikuti tujuan post dan wajib berbeda antar ide: jangan menutup banyak slide dengan "Simpan … untuk …". Pilih tindakan yang paling dekat dengan hasil bisnis (survei, tanya lewat DM dengan kata kunci, simpan checklist, coba langsung) dan tulis alasannya dalam satu kalimat.',
    '- Slide 2 mulai membayar janji hook tanpa basa-basi. Hook menyebut "5 cara" berarti Value harus memberikan 5 cara lengkap.',
    '- Janji hook wajib dibuktikan secara konkret: "bandingkan A dan B" berarti ada slide perbandingan berdampingan dengan kriteria yang sama (mis. waktu, biaya, risiko); "apa artinya" berarti ada jawaban nyata, bukan ajakan untuk memikirkannya.',
    '- Untuk topik fasilitas atau produk, jangan membagi isi menjadi satu slide per nama fasilitas lalu menjelaskan fungsi yang sudah jelas. Susun sebagai skenario penggunaan konkret: siapa melakukan apa, kapan, dan bagaimana memulainya. Contoh skenario adalah usulan ("coba", "misalnya"), bukan janji hasil atau testimoni. Jika audiens keluarga muda, hadirkan aktivitas bersama pasangan atau anak, tanpa mengasumsikan anak boleh memakai alat dewasa atau bisa ditinggal tanpa pendampingan. Detail yang belum diketahui dilewati saja, bukan diganti nasihat untuk bertanya atau mengecek.',
    '- Tiap slide isi membawa informasi baru yang belum ada di slide lain: jangan ulangi poin, manfaat, atau kalimat yang sama dengan kata berbeda. Hindari poin kosong seperti "pertimbangkan kenyamanan" atau "pikirkan kebutuhan Anda"; ganti dengan fakta, angka, contoh, atau langkah yang bisa langsung dipakai. Nasihat seperti "tanyakan rinciannya", "cek saat survei", "catat", atau "cocokkan dengan kebutuhan" juga poin kosong: paling banyak satu kalimat seperti itu per carousel, kecuali topiknya memang checklist. Isi nilainya dari fakta brand ditambah pengetahuan umum yang pasti benar (mis. arti istilah, cara menghitung, cara melakukan kegiatan umum), tanpa klaim baru tentang brand atau janji hasil kesehatan.',
    '- Jaga cakupan fakta saat menjelaskan manfaat: ketinggian bangunan tidak membuktikan ketinggian jalan akses atau perjalanan bebas genangan; nama promo tidak membuktikan semua komponen biaya ditanggung. Pisahkan fakta tertulis, hitungan yang dapat diturunkan, dan contoh bersyarat. Pada pembiayaan, sisa harga setelah DP bukan otomatis plafon KPR yang disetujui bank; sebut sebagai sisa harga, atau beri syarat eksplisit jika seluruh sisa diasumsikan dibiayai dalam simulasi; hapus akibat yang membutuhkan fakta tambahan, bukan menyamarkannya dengan kata bisa.',
    '- Cocokkan semua angka dan kata bilangan di judul maupun body (mis. tiga, keempatnya, kelimanya) dengan item berbeda yang benar-benar disebut, bukan jumlah slide atau kelompok promo. Kalau pengelompokannya ambigu, hilangkan totalnya. Kalau fakta untuk salah satu poin tidak ada, kurangi angkanya atau hapus angka dari hook, jangan mengarang.',
    `- Tiap slide isi berisi satu hal yang bisa langsung dipakai pembaca (langkah konkret, contoh kalimat, checklist, angka dari topik), bukan sekadar nama konsep. ${INNER_SLIDE[density]}`,
    slides === 2
      ? '- Carousel 2 slide: slide 2 adalah Value + CTA; jawaban atau isi wajib membayar hook, lalu boleh ditutup satu ajakan singkat.'
      : '- Slide CTA: tepat satu ajakan singkat yang paling cocok dengan topik (follow, simpan, bagikan, komentar, atau link di bio), bukan gabungan. Tidak perlu paragraf, daftar contoh, atau tips untuk memenuhi kepadatan.',
    '- Hindari isi generik: kalau slide tetap masuk akal untuk topik lain, tulis ulang lebih spesifik. Jangan pakai frasa kosong seperti "game changer", "next level", "ubah segalanya", "solusi yang berhasil". Jangan ulangi pola kalimat yang sama di slide berbeda.',
    '- Pakai satu gaya sapaan secara konsisten, mengikuti gaya bahasa brand kalau ada.',
    '- Caption mendukung slide, bukan menyalin semua isinya.',
    '- Sebelum menjawab, periksa: cover memakai hook 5–12 kata yang menampilkan satu benda, kalimat, angka, atau adegan nyata, menyebut subjeknya, dan sesuai suara brand; subheading hanya ada bila membantu dan tetap pendek; isi membayar janji hook dan mengikuti kepadatan; tidak ada klaim tanpa bukti. Tulis ulang bagian yang belum memenuhi, lalu keluarkan hanya JSON akhir tanpa hasil pemeriksaan.',
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

  'Skenario memakai kata coba, bisa, atau misalnya: bukan testimoni penghuni, jaminan hasil, atau klaim semua kegiatan dapat dilakukan bersamaan. Jangan menambah fasilitas demi cerita.',

  'Ukuran layak: setelah membaca, audiens mendapat keputusan, langkah, pembeda, atau gambaran kegiatan yang tidak sudah habis dijelaskan di cover. CTA melanjutkan manfaat itu, bukan sekadar "kenali produk". Sesuaikan bentuk dengan fakta dan tujuan; jangan memaksakan pola contoh ke semua topik.',
].join('\n')
