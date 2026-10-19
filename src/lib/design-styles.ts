/** Design styles and fonts the owner picks from, shared by the onboarding, the /brand page and the image prompt. */
import type { Picker, SlideRole } from './brand-options'

/** Google Fonts the image model draws well. Each has normal proportions; condensed faces are left out on purpose. */
export const FONT_CHOICES = [
  { name: 'Plus Jakarta Sans', kind: 'sans' },
  { name: 'Poppins', kind: 'sans' },
  { name: 'Montserrat', kind: 'sans' },
  { name: 'Inter', kind: 'sans' },
  { name: 'DM Sans', kind: 'sans' },
  { name: 'Manrope', kind: 'sans' },
  { name: 'Outfit', kind: 'sans' },
  { name: 'Space Grotesk', kind: 'sans' },
  { name: 'Playfair Display', kind: 'serif' },
  { name: 'DM Serif Display', kind: 'serif' },
  { name: 'Fraunces', kind: 'serif' },
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
  /**
   * Example slides from the owner's design collection, as keys of assets/contoh-desain/<key>.jpg, in sets of one
   * family; one set per post, used when the account has no design references of its own.
   */
  examples: readonly ExampleSet[]
}

/** One family of example slides: the cover, inner and CTA slide a post can copy the layout of. */
export type ExampleSet = Partial<Record<SlideRole, string>>

export const DESIGN_STYLES = {
  minimalis: {
    label: 'Minimalis Modern',
    summary: 'Bersih, banyak ruang kosong, tipografi jadi pusat perhatian.',
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
    examples: [
      { cover: 'terang-laptop', isi: 'daftar-layanan' },
      { cover: 'terang-astronot', isi: 'daftar-layanan' },
    ],
  },
  bold: {
    label: 'Bold Kreatif',
    summary: 'Warna berani, huruf besar, blok warna, kontras tinggi.',
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
    examples: [
      { cover: 'bento-produk', isi: 'langkah-bernomor', cta: 'gelap-cta' },
      { cover: 'gelap-orang', isi: 'langkah-bernomor', cta: 'gelap-cta' },
    ],
  },
  elegan: {
    label: 'Elegan Premium',
    summary: 'Serif mewah, warna kalem, kesan eksklusif.',
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
    examples: [{ isi: 'foto-kartu-teks' }],
  },
  ceria: {
    label: 'Ceria & Playful',
    summary: 'Warna pastel cerah, bentuk membulat, ilustrasi lucu.',
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
    examples: [{ cover: 'tipografi-ilustrasi' }],
  },
  editorial: {
    label: 'Editorial Majalah',
    summary: 'Seperti halaman majalah: foto kuat, grid rapi, judul besar.',
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
    examples: [
      { cover: 'foto-penuh-judul-bawah', isi: 'berita-foto-atas' },
      { cover: 'foto-potret-kartu', isi: 'berita-foto-atas' },
    ],
  },
  profesional: {
    label: 'Profesional Korporat',
    summary: 'Rapi, terpercaya, warna biru/navy, data dan ikon.',
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
    examples: [
      { cover: 'grafik-pertanyaan', isi: 'testimoni', cta: 'cta-avatar' },
      { cover: 'lingkaran-pertanyaan', isi: 'tim-kartu', cta: 'cta-avatar' },
    ],
  },
  natural: {
    label: 'Natural & Organik',
    summary: 'Warna tanah, tekstur kertas, daun, nuansa hangat.',
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
    examples: [],
  },
  tech: {
    label: 'Tech Modern',
    summary: 'Latar gelap, aksen neon, grid futuristis.',
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
    examples: [
      { cover: 'gelap-objek-3d', isi: 'kartu-aplikasi', cta: 'gelap-cta' },
      { cover: 'gelap-perangkat', isi: 'langkah-bernomor', cta: 'gelap-cta' },
      { cover: 'gelap-megafon', isi: 'langkah-bernomor', cta: 'gelap-cta' },
    ],
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

/** The chosen style, or a clean default when the owner chose none and has no style of their own posts either. */
export function styleForBrand(brand: { designStyle: string; visualStyle: string } | null): DesignStyle | null {
  const chosen = designStyleOf(brand?.designStyle)
  if (chosen) return chosen
  return brand?.visualStyle ? null : DESIGN_STYLES.minimalis
}

const STYLES: DesignStyle[] = Object.values(DESIGN_STYLES)
const EXAMPLE_KEYS = new Set(STYLES.flatMap((style) => style.examples.flatMap((set) => Object.values(set))))

/** A key of one of the styles' examples: the only names a stored slide may load from assets/contoh-desain. */
export const isStyleExample = (value: unknown): value is string => typeof value === 'string' && EXAMPLE_KEYS.has(value)

/**
 * Each slide's example when the account has no design references: one set per post, so its slides come from one
 * family. A one-image post takes the set's cover; a role the set has none for gets none.
 */
export function planStyleExamples(style: DesignStyle | null, roles: (SlideRole | null)[], pick: Picker): (string | null)[] {
  const set = style ? pick([...style.examples]) : undefined
  return roles.map((role) => set?.[role ?? 'cover'] ?? null)
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
