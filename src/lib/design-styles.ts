/** Design styles and fonts the owner picks from, shared by the onboarding, the /brand page and the image prompt. */
import type { SlideRole } from './brand-options'

/** Google Fonts the image model draws well. Each has normal proportions; condensed faces are left out on purpose. */
export const FONT_CHOICES = [
  { name: 'Plus Jakarta Sans', kind: 'sans', use: 'modern & lokal' },
  { name: 'Inter', kind: 'sans', use: 'bersih & mudah dibaca' },
  { name: 'DM Sans', kind: 'sans', use: 'modern & ramah' },
  { name: 'Manrope', kind: 'sans', use: 'premium & minimalis' },
  { name: 'Sora', kind: 'sans', use: 'tech & futuristis' },
  { name: 'Space Grotesk', kind: 'sans', use: 'tech & editorial' },
  { name: 'Outfit', kind: 'sans', use: 'ceria & geometris' },
  { name: 'Rubik', kind: 'sans', use: 'ramah & tegas' },
  { name: 'Nunito Sans', kind: 'sans', use: 'hangat & santai' },
  { name: 'Roboto', kind: 'sans', use: 'netral & informatif' },
  { name: 'Open Sans', kind: 'sans', use: 'jelas & profesional' },
  { name: 'Lato', kind: 'sans', use: 'humanis & profesional' },
  { name: 'Poppins', kind: 'sans', use: 'bold & populer' },
  { name: 'Montserrat', kind: 'sans', use: 'korporat & tegas' },
  { name: 'Playfair Display', kind: 'serif', use: 'mewah & editorial' },
  { name: 'DM Serif Display', kind: 'serif', use: 'editorial & berkarakter' },
  { name: 'Fraunces', kind: 'serif', use: 'organik & ekspresif' },
  { name: 'Lora', kind: 'serif', use: 'hangat & elegan' },
  { name: 'Merriweather', kind: 'serif', use: 'tepercaya & mudah dibaca' },
  { name: 'Libre Baskerville', kind: 'serif', use: 'klasik & premium' },
] as const

export type FontName = (typeof FONT_CHOICES)[number]['name']

export const DEFAULT_HEADING_FONT: FontName = 'Plus Jakarta Sans'
export const DEFAULT_BODY_FONT: FontName = 'Inter'

/** Which slides a recipe is for: a carousel's three roles, or a post of one image. */
export type LayoutRole = SlideRole | 'single'

export interface DesignStyle {
  label: string
  /** One line for the owner, in Indonesian. */
  summary: string
  /** Hardcoded copy used to demonstrate the three carousel roles in the picker. */
  samples: readonly { role: SlideRole; label: string; title: string; copy: string }[]
  /** Who it suits, in Indonesian. */
  suits: string
  headingFont: FontName
  bodyFont: FontName
  /** Background, ink and accent for the little previews when the brand has no colours yet. */
  preview: { background: string; ink: string; accent: string }
  /** The shared design system of every slide, in English for the image model. */
  look: string
  /** The layout of each role, in English. */
  layouts: Record<LayoutRole, string>
}

export const DESIGN_STYLES = {
  minimalis: {
    label: 'Minimalis Modern',
    summary: 'Bersih, banyak ruang kosong, tipografi jadi pusat perhatian.',
    samples: [
      { role: 'cover', label: 'Panduan praktis', title: 'Konten Rapi, Pesan Lebih Sampai', copy: 'Mulai dari satu ide yang jelas.' },
      { role: 'isi', label: '01 · Fokus', title: 'Satu slide, satu pesan', copy: 'Ruang kosong membantu pembaca menangkap inti.' },
      { role: 'cta', label: 'Langkah berikutnya', title: 'Siap merapikan kontenmu?', copy: 'Simpan panduan ini →' },
    ],
    suits: 'Edukasi, jasa profesional, produk premium yang tenang.',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    preview: { background: '#f7f5f0', ink: '#141414', accent: '#2f6f5e' },
    look: 'Minimal modern design: a plain off-white or very light solid background, generous white space, one accent colour used sparingly, thin hairline rules or small dots as the only graphic elements, no clutter.',
    layouts: {
      cover:
        'Cover layout: a small label above a large bold headline, left-aligned in the upper part; below it, in its own band, one photo or simple object whose top edge fades softly into the plain background; lots of empty space.',
      isi: 'Inner slide layout: a small slide number top-left, a short bold subheading, then the remaining lines as calm body text, left-aligned; an optional small icon or simple illustration below the text; no big hero title.',
      cta: 'CTA layout: centred, one short bold line, the action as a simple rounded pill or underlined text, a small brand mark or handle at the bottom; mostly empty space.',
      single:
        'Layout: one clear focal point, the text left-aligned with generous margins, plenty of empty space.',
    },
  },
  bold: {
    label: 'Bold Kreatif',
    summary: 'Warna berani, huruf besar, blok warna, kontras tinggi.',
    samples: [
      { role: 'cover', label: 'Stop scroll', title: 'Ide Bagus Harus Terlihat!', copy: 'Geser buat lihat caranya →' },
      { role: 'isi', label: '01', title: 'Buka dengan kejutan', copy: 'Pakai satu kalimat yang langsung menantang.' },
      { role: 'cta', label: 'Giliran kamu', title: 'Bikin Kontenmu Menonjol', copy: 'Coba sekarang →' },
    ],
    suits: 'Kreator, brand anak muda, promo dan konten viral.',
    headingFont: 'Poppins',
    bodyFont: 'DM Sans',
    preview: { background: '#1d1bff', ink: '#ffffff', accent: '#ffd23f' },
    look: 'Bold creative design: solid saturated colour blocks, very large confident type, flat geometric shapes (circles, arrows, stickers) in the accent colour, high contrast, energetic but organised on a clear grid.',
    layouts: {
      cover:
        'Cover layout: a huge headline filling most of the width, two or three lines, one key word highlighted with a flat accent-coloured block behind it; a bold arrow or "swipe" cue near the bottom edge.',
      isi: 'Inner slide layout: a big flat number at the top, then a bold subheading and short body lines on a solid colour panel below it; smaller type than the cover, same colours.',
      cta: 'CTA layout: one punchy line, the action inside a large flat button shape in the accent colour, a small handle below.',
      single: 'Layout: a big headline over a solid colour block with flat geometric accents, high contrast.',
    },
  },
  elegan: {
    label: 'Elegan Premium',
    summary: 'Serif mewah, warna kalem, kesan eksklusif.',
    samples: [
      { role: 'cover', label: 'THE EDIT', title: 'Detail Kecil, Kesan Berkelas', copy: 'Panduan membangun citra premium.' },
      { role: 'isi', label: '01 · Detail', title: 'Kurasi, bukan dekorasi', copy: 'Pilih elemen yang punya alasan untuk hadir.' },
      { role: 'cta', label: 'Discover more', title: 'Temukan gaya khas brand Anda', copy: 'Mulai eksplorasi' },
    ],
    suits: 'Fashion, kecantikan, perhiasan, hotel, kuliner fine dining.',
    headingFont: 'Playfair Display',
    bodyFont: 'Manrope',
    preview: { background: '#efe9e1', ink: '#2b2420', accent: '#a6834e' },
    look: 'Elegant premium design: a refined serif for headings with a clean sans for small text, muted warm neutrals with a single gold or deep accent, soft natural light in photos, thin frames or fine lines, calm luxurious spacing.',
    layouts: {
      cover:
        'Cover layout: an elegant serif headline centred or set low over a softly lit, uncluttered photo or a plain warm background; a small uppercase spaced-out label above it; a thin line ornament.',
      isi: 'Inner slide layout: a plain warm background, a serif subheading with a small number, short body lines in the sans, and an optional photo in a thin frame in its own band below the text.',
      cta: 'CTA layout: centred serif line, the action in small spaced uppercase sans below a thin line, the brand name at the bottom.',
      single: 'Layout: a calm, softly lit composition with a refined serif headline and generous margins.',
    },
  },
  ceria: {
    label: 'Ceria & Playful',
    summary: 'Warna pastel cerah, bentuk membulat, ilustrasi lucu.',
    samples: [
      { role: 'cover', label: 'Yuk, belajar!', title: 'Bikin Ide Jadi Seru', copy: 'Geser untuk mulai ✦' },
      { role: 'isi', label: '01', title: 'Mulai dari yang kamu suka', copy: 'Ide ringan lebih mudah dikembangkan.' },
      { role: 'cta', label: 'Sampai sini!', title: 'Saatnya Coba Sendiri', copy: 'Ayo mulai →' },
    ],
    suits: 'Produk anak, makanan ringan, hobi, komunitas santai.',
    headingFont: 'Outfit',
    bodyFont: 'DM Sans',
    preview: { background: '#ffe6ef', ink: '#2a1e3a', accent: '#ff7a59' },
    look: 'Playful cheerful design: bright pastel backgrounds, rounded shapes and cards, friendly flat illustrations or stickers, rounded sans-serif type, a warm happy mood, still tidy and readable.',
    layouts: {
      cover:
        'Cover layout: a big rounded headline on a pastel background, a friendly flat illustration or cut-out product below it, a few small doodles or sparkles around.',
      isi: 'Inner slide layout: a rounded white card on the pastel background holding a numbered subheading and short body lines, a small sticker-like illustration in one corner.',
      cta: 'CTA layout: a cheerful short line, the action in a rounded pill button, a small illustration waving or pointing at it.',
      single: 'Layout: a bright pastel scene with rounded shapes, a friendly illustration and a rounded headline.',
    },
  },
  editorial: {
    label: 'Editorial Majalah',
    summary: 'Seperti halaman majalah: foto kuat, grid rapi, judul besar.',
    samples: [
      { role: 'cover', label: 'ISSUE 01 · INSIGHT', title: 'Cara Baru Melihat Kebiasaan Lama', copy: 'Catatan untuk hidup yang lebih sadar.' },
      { role: 'isi', label: '01 · Perspektif', title: 'Yang luput dari perhatian', copy: 'Perubahan besar sering bermula dari observasi kecil.' },
      { role: 'cta', label: 'End note', title: 'Apa yang ingin kamu ubah?', copy: 'Bagikan perspektifmu →' },
    ],
    suits: 'Media, opini, lifestyle, personal brand.',
    headingFont: 'DM Serif Display',
    bodyFont: 'Inter',
    preview: { background: '#f2efe8', ink: '#111111', accent: '#c8452c' },
    look: 'Editorial magazine design: strong photography, a strict column grid, a large display serif headline with small sans captions, thin rules, issue-style labels and page numbers, black text on paper-like backgrounds.',
    layouts: {
      cover:
        'Cover layout: a striking full-bleed photo with a large display serif headline set in a clear area of it, a small issue-style label at the top, like a magazine cover.',
      isi: 'Inner slide layout: like an article page: a photo band across the top, then a serif subheading and a pull quote or short body lines below it, a thin rule and a page number at the bottom.',
      cta: 'CTA layout: a paper background, a big serif line, the action as a small underlined caption, the handle like a byline.',
      single: 'Layout: a magazine-style photo with a display serif headline and small sans caption.',
    },
  },
  profesional: {
    label: 'Profesional Korporat',
    summary: 'Rapi, terpercaya, warna biru/navy, data dan ikon.',
    samples: [
      { role: 'cover', label: 'BUSINESS BRIEF', title: 'Keputusan Lebih Tepat dengan Data', copy: 'Tiga langkah membaca peluang.' },
      { role: 'isi', label: '01 · Analisis', title: 'Mulai dari indikator utama', copy: 'Bandingkan tren, bukan satu angka terpisah.' },
      { role: 'cta', label: 'Konsultasi', title: 'Siap menyusun langkah berikutnya?', copy: 'Hubungi tim kami →' },
    ],
    suits: 'B2B, keuangan, konsultan, kesehatan, pendidikan formal.',
    headingFont: 'Montserrat',
    bodyFont: 'Inter',
    preview: { background: '#ffffff', ink: '#0f2a4a', accent: '#1f7ae0' },
    look: 'Professional corporate design: white or light grey backgrounds with a deep navy and one blue accent, a precise grid, simple line icons, clean charts or checklists, trustworthy and calm.',
    layouts: {
      cover:
        'Cover layout: a thin accent bar at the top, a strong headline in the upper part, then a clean professional photo or simple chart graphic in its own band below it.',
      isi: 'Inner slide layout: a numbered subheading, short body lines as a checklist or bullet list with line icons, a thin accent bar, a light grey card behind the text.',
      cta: 'CTA layout: a clear one-line offer, the action in a solid navy button, contact handle beneath.',
      single: 'Layout: a clean grid with a clear headline, a professional photo or chart, and line icons.',
    },
  },
  natural: {
    label: 'Natural & Organik',
    summary: 'Warna tanah, tekstur kertas, daun, nuansa hangat.',
    samples: [
      { role: 'cover', label: 'SLOW LIVING NOTE', title: 'Kebiasaan Baik Tumbuh Perlahan', copy: 'Mulai dari hal kecil setiap hari.' },
      { role: 'isi', label: '01 · Bertumbuh', title: 'Beri ruang untuk proses', copy: 'Konsistensi lebih penting dari kesempurnaan.' },
      { role: 'cta', label: 'A gentle reminder', title: 'Mulai dengan satu langkah', copy: 'Simpan untuk nanti' },
    ],
    suits: 'Produk alami, kopi, kesehatan, wellness, F&B rumahan.',
    headingFont: 'Fraunces',
    bodyFont: 'DM Sans',
    preview: { background: '#ece4d4', ink: '#2f3a2a', accent: '#b5643c' },
    look: 'Natural organic design: earthy tones (sage, sand, terracotta), a subtle paper or linen texture background, soft daylight photos, hand-drawn leaf or line accents, a soft serif for headings, warm and calm.',
    layouts: {
      cover:
        'Cover layout: a soft serif headline in the upper part of a textured earthy background, and below it a daylight photo of the product or a natural scene cut into an arch or rounded shape.',
      isi: 'Inner slide layout: the same textured background, a small numbered serif subheading, short body lines, a small hand-drawn leaf or line accent; no big photo.',
      cta: 'CTA layout: centred serif line, the action in a soft rounded outline button, a small leaf accent.',
      single: 'Layout: an earthy textured scene with daylight, a soft serif headline and hand-drawn accents.',
    },
  },
  tech: {
    label: 'Tech Modern',
    summary: 'Latar gelap, aksen neon, grid futuristis.',
    samples: [
      { role: 'cover', label: 'SYSTEM UPDATE', title: 'Kerja Cepat Tanpa Alur Rumit', copy: 'Optimalkan proses digitalmu.' },
      { role: 'isi', label: '01 · AUTOMATE', title: 'Hilangkan kerja berulang', copy: 'Biarkan sistem menangani tugas rutin.' },
      { role: 'cta', label: 'READY TO START?', title: 'Upgrade Cara Kerjamu', copy: 'Mulai sekarang →' },
    ],
    suits: 'Teknologi, aplikasi, gaming, crypto, digital marketing.',
    headingFont: 'Space Grotesk',
    bodyFont: 'Inter',
    preview: { background: '#0d0f14', ink: '#f4f6fb', accent: '#5cf2c2' },
    look: 'Modern tech design: a dark near-black background, one bright neon accent, a subtle grid or dot pattern, crisp geometric sans type, clean UI-like cards and icons, sharp and futuristic but not busy.',
    layouts: {
      cover:
        'Cover layout: a big crisp headline in the upper part of a dark background, one word in the neon accent, and below it a clean device mockup or abstract geometric graphic, a faint grid behind.',
      isi: 'Inner slide layout: a dark UI-style card with a numbered subheading and short body lines, a small line icon in the accent colour, the same faint grid.',
      cta: 'CTA layout: one crisp line, the action in a neon-outlined button, the handle in small monospace-like type.',
      single: 'Layout: a dark, crisp composition with a neon accent, a faint grid and a geometric sans headline.',
    },
  },
} as const satisfies Record<string, DesignStyle>

export type DesignStyleId = keyof typeof DESIGN_STYLES

export const DESIGN_STYLE_IDS = Object.keys(DESIGN_STYLES) as DesignStyleId[]

/** Own keys only, like isImageFormat. */
export const isDesignStyle = (value: unknown): value is DesignStyleId =>
  typeof value === 'string' && Object.hasOwn(DESIGN_STYLES, value)

/** The style of a stored value, or null for empty or one no longer offered. */
export const designStyleOf = (value: string | null | undefined): DesignStyle | null =>
  isDesignStyle(value) ? DESIGN_STYLES[value] : null

type BrandStyle = { designStyle: string; visualStyle: string } | null

/** The chosen style's id, or a clean default when the owner chose none and has no style of their own posts either. */
export function styleIdForBrand(brand: BrandStyle): DesignStyleId | null {
  const chosen = brand?.designStyle
  if (isDesignStyle(chosen)) return chosen
  return brand?.visualStyle ? null : 'minimalis'
}

export function styleForBrand(brand: BrandStyle): DesignStyle | null {
  const id = styleIdForBrand(brand)
  return id ? DESIGN_STYLES[id] : null
}

/** What kind of account the owner runs: it shapes the tone of the captions. */
export const ACCOUNT_KINDS = {
  bisnis: { label: 'Bisnis / toko', hint: 'Jual produk, online atau offline.' },
  jasa: { label: 'Jasa / profesional', hint: 'Konsultan, klinik, agensi, freelancer.' },
  kreator: { label: 'Kreator / personal brand', hint: 'Konten, opini, keahlian pribadi.' },
  edukasi: { label: 'Edukasi / komunitas', hint: 'Kursus, tips, organisasi, komunitas.' },
} as const

export type AccountKind = keyof typeof ACCOUNT_KINDS

export const isAccountKind = (value: unknown): value is AccountKind =>
  typeof value === 'string' && Object.hasOwn(ACCOUNT_KINDS, value)
