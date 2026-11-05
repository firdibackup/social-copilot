/**
 * Built-in editable templates: plain design documents built in code, so every text, shape and photo slot stays
 * editable and the AI fields are already marked. Photo slots are gradient placeholders marked "AI-generated" until
 * an image is dropped in or generated.
 */
import { hexColor, type DesignNode, type DesignPage, type Paint, type TextNode, type ShapeNode } from './design-doc'
import type { FieldConfig } from './design-fields'

export type StarterCategory = 'cover' | 'content' | 'data' | 'quote' | 'cta' | 'promo'
export const STARTER_CATEGORIES: readonly StarterCategory[] = ['cover', 'content', 'data', 'quote', 'cta', 'promo']
export type StarterFormat = '4:5' | '1:1'
export const STARTER_SIZES: Record<StarterFormat, { width: number; height: number }> = {
  '4:5': { width: 1080, height: 1350 }, '1:1': { width: 1080, height: 1080 },
}

export interface StarterTemplate { id: string; category: StarterCategory; name: { id: string; en: string } }
type Ctx = { w: number; h: number; n: number; prefix: string }
type Box = { x: number; y: number; w: number; h: number }

const ID_PREFIX = '5ca7e000-0000-4000-8'
const W = 1080
/** Stable ids keep the starter thumbnails cacheable and tests deterministic; inserting copies gets fresh ids. */
function nextId(ctx: Ctx) {
  ctx.n += 1
  return `${ID_PREFIX}${ctx.prefix}-${String(ctx.n).padStart(12, '0')}`
}
const solid = (hex: string): Paint => ({ type: 'solid', color: hexColor(hex) })
/** Stops are `#rrggbb` or `#rrggbb/alpha` (0–1). */
const gradient = (angle: number, ...stops: string[]): Paint => ({ type: 'gradient', kind: 'linear', angle,
  stops: stops.map((stop, index) => {
    const [hex, a = '1'] = stop.split('/')
    return { offset: index / (stops.length - 1), color: { srgb: { ...hexColor(hex).srgb, a: Number(a) } } }
  }) })

interface TextOpts {
  font?: string; size: number; weight?: number; color?: string; align?: 'left' | 'center' | 'right'
  lineHeight?: number; upper?: boolean; spacing?: number; italic?: boolean
  ai?: string; length?: 'auto' | 'short' | 'medium' | 'long'; role?: string; valign?: 'top' | 'middle' | 'bottom'
}
function text(ctx: Ctx, name: string, value: string, box: Box, o: TextOpts): TextNode {
  const field: FieldConfig | undefined = o.ai ? { kind: 'text', mode: 'ai', prompt: o.ai, length: o.length ?? 'auto' } : undefined
  const data = field || o.role ? { carousely: { ...(field ? { field } : {}), ...(o.role ? { role: o.role } : {}) } } : undefined
  return { id: nextId(ctx), name, type: 'text', transform: { x: box.x, y: box.y, scaleX: 1, scaleY: 1, rotation: 0 },
    size: { width: box.w, height: box.h }, opacity: 1,
    // Shrink-to-fit so AI text longer than the example still stays inside its box.
    box: { mode: 'fixed', width: box.w, height: box.h, autoFit: { enabled: true, min: Math.min(o.size, Math.max(12, Math.round(o.size * 0.5))), max: o.size },
      verticalAlign: o.valign ?? 'top' },
    content: [{ runs: [{ text: value, style: { fontFamily: o.font ?? 'Plus Jakarta Sans', fontStyle: o.italic ? 'Italic' : 'Regular',
      fontSize: o.size, axes: { wght: o.weight ?? 400 }, fill: solid(o.color ?? '#171827'), underline: false,
      letterSpacing: o.spacing ?? 0, case: o.upper ? 'upper' : 'none' } }],
    style: { align: o.align ?? 'left', direction: 'auto', lineHeight: o.lineHeight ?? 1.15 } }],
    ...(data ? { data } : {}) }
}
function shape(ctx: Ctx, name: string, kind: ShapeNode['kind'], box: Box, fill: Paint,
  o: { radius?: number; stroke?: { color: string; width: number }; opacity?: number } = {}): ShapeNode {
  return { id: nextId(ctx), name, type: 'shape', kind, transform: { x: box.x, y: box.y, scaleX: 1, scaleY: 1, rotation: 0 },
    size: { width: box.w, height: box.h }, opacity: o.opacity ?? 1, cornerRadius: o.radius ?? 0, fill,
    ...(o.stroke ? { stroke: { color: hexColor(o.stroke.color), width: o.stroke.width } } : {}) }
}
/**
 * A photo slot: a gradient shape (so it renders without any image) named after what belongs there. The owner drops
 * an image in from the editor; ponytail: AI image fields need an image node, so slots become fields once filled.
 */
function photo(ctx: Ctx, name: string, box: Box, hint: string, tones: [string, string], radius = 0): ShapeNode {
  const node = shape(ctx, `${name} · ${hint}`.slice(0, 120), 'rect', box, gradient(135, ...tones), { radius })
  node.data = { carousely: { role: 'photo' } }
  return node
}

type Build = (ctx: Ctx) => { background: Paint; children: DesignNode[]; caption?: string }
interface Def extends StarterTemplate { build: Build }

const ink = '#171827', muted = '#6b6d80', violet = '#6558f5', lavender = '#e9e5ff', mint = '#b8f3d6', cream = '#f6f1e7'
const navy = '#0f1b3d', coral = '#ff6b4a', sun = '#ffd166', forest = '#1f4d3a'

const DEFS: Def[] = [
  // ---------- Cover ----------
  { id: 'cover-bold', category: 'cover', name: { id: 'Cover · Judul besar', en: 'Cover · Big headline' }, build: ctx => ({ background: solid(violet), children: [
    text(ctx, 'Label', 'PANDUAN SINGKAT', { x: 88, y: 120, w: 600, h: 40 }, { size: 28, weight: 700, color: lavender, upper: true, spacing: 12, role: 'lainnya' }),
    text(ctx, 'Judul', '5 cara bikin pelanggan balik lagi', { x: 88, y: 200, w: 904, h: ctx.h - 560 }, { size: 120, weight: 800, color: '#ffffff', lineHeight: 1.02,
      ai: 'Judul cover yang memancing rasa penasaran tentang topik konten', length: 'medium', role: 'judul' }),
    shape(ctx, 'Garis aksen', 'rect', { x: 88, y: ctx.h - 300, w: 120, h: 12 }, solid(mint), { radius: 6 }),
    text(ctx, 'Subjudul', 'Geser untuk lihat caranya →', { x: 88, y: ctx.h - 250, w: 904, h: 90 }, { size: 40, weight: 500, color: '#ffffff',
      ai: 'Satu kalimat ajakan untuk geser carousel', length: 'short', role: 'subjudul' }),
  ] }) },
  { id: 'cover-photo', category: 'cover', name: { id: 'Cover · Foto penuh', en: 'Cover · Full-bleed photo' }, build: ctx => ({ background: solid(navy), children: [
    photo(ctx, 'Foto', { x: 0, y: 0, w: W, h: ctx.h }, 'foto utama yang menggambarkan topik', ['#3a4a7a', '#0f1b3d']),
    shape(ctx, 'Gelap bawah', 'rect', { x: 0, y: ctx.h * 0.45, w: W, h: ctx.h * 0.55 }, gradient(90, '#0f1b3d/0', '#0f1b3d/0.92')),
    text(ctx, 'Judul', 'Rahasia dapur yang jarang dibagikan', { x: 72, y: ctx.h - 470, w: 936, h: 300 }, { size: 96, weight: 800, color: '#ffffff', lineHeight: 1.05, valign: 'bottom',
      ai: 'Judul cover singkat dan kuat tentang topik', length: 'medium', role: 'judul' }),
    text(ctx, 'Subjudul', 'Seri tips minggu ini', { x: 72, y: ctx.h - 150, w: 936, h: 60 }, { size: 36, weight: 500, color: '#d8dcf0', role: 'subjudul' }),
  ] }) },
  { id: 'cover-split', category: 'cover', name: { id: 'Cover · Foto & teks', en: 'Cover · Photo split' }, build: ctx => ({ background: solid(cream), children: [
    photo(ctx, 'Foto', { x: 0, y: 0, w: W, h: Math.round(ctx.h * 0.55) }, 'foto produk atau suasana bisnis', ['#e8c9a0', '#b07a4f']),
    text(ctx, 'Label', 'TIPS', { x: 88, y: Math.round(ctx.h * 0.55) + 64, w: 300, h: 40 }, { size: 28, weight: 700, color: coral, upper: true, spacing: 14, role: 'lainnya' }),
    text(ctx, 'Judul', 'Cara memilih biji kopi yang pas', { x: 88, y: Math.round(ctx.h * 0.55) + 120, w: 904, h: Math.round(ctx.h * 0.45) - 200 }, { size: 84, weight: 400, color: ink, lineHeight: 1.05,
      font: 'DM Serif Display', ai: 'Judul cover tentang topik konten', length: 'medium', role: 'judul' }),
  ] }) },
  { id: 'cover-editorial', category: 'cover', name: { id: 'Cover · Editorial serif', en: 'Cover · Editorial serif' }, build: ctx => ({ background: solid('#fbfaf7'), children: [
    text(ctx, 'Nomor edisi', 'Edisi 01', { x: 88, y: 110, w: 400, h: 50 }, { size: 32, weight: 500, color: muted, role: 'lainnya' }),
    shape(ctx, 'Garis', 'line', { x: 88, y: 190, w: 904, h: 4 }, solid(ink), { stroke: { color: ink, width: 2 } }),
    text(ctx, 'Judul', 'Hal kecil yang bikin bisnis terasa premium', { x: 88, y: 260, w: 904, h: ctx.h - 560 }, { size: 112, weight: 400, color: ink, lineHeight: 1.0,
      font: 'Playfair Display', ai: 'Judul cover elegan bergaya majalah tentang topik', length: 'long', role: 'judul' }),
    text(ctx, 'Subjudul', 'Catatan untuk pemilik usaha', { x: 88, y: ctx.h - 220, w: 904, h: 60 }, { size: 36, italic: true, font: 'Playfair Display', color: muted, role: 'subjudul' }),
  ] }) },
  { id: 'cover-question', category: 'cover', name: { id: 'Cover · Pertanyaan', en: 'Cover · Question hook' }, build: ctx => ({ background: solid(sun), children: [
    shape(ctx, 'Lingkaran', 'ellipse', { x: 640, y: -120, w: 560, h: 560 }, solid('#ffffff'), { opacity: 0.35 }),
    text(ctx, 'Tanda tanya', '?', { x: 760, y: 40, w: 280, h: 360 }, { size: 340, weight: 800, color: ink, align: 'center', role: 'lainnya' }),
    text(ctx, 'Judul', 'Kenapa jualanmu sepi padahal produknya bagus?', { x: 88, y: ctx.h - 760, w: 904, h: 520 }, { size: 96, weight: 800, color: ink, lineHeight: 1.05, valign: 'bottom',
      ai: 'Pertanyaan pembuka yang relate dengan masalah audiens', length: 'medium', role: 'judul' }),
    text(ctx, 'Subjudul', 'Jawabannya di slide berikut', { x: 88, y: ctx.h - 190, w: 904, h: 60 }, { size: 38, weight: 600, color: ink, role: 'subjudul' }),
  ] }) },
  // ---------- Isi ----------
  { id: 'content-numbered', category: 'content', name: { id: 'Isi · Poin bernomor', en: 'Content · Numbered point' }, build: ctx => ({ background: solid('#ffffff'), children: [
    text(ctx, 'Nomor', '01', { x: 88, y: 120, w: 400, h: 220 }, { size: 200, weight: 800, color: violet, role: 'lainnya' }),
    text(ctx, 'Judul', 'Sapa pelanggan dengan namanya', { x: 88, y: 380, w: 904, h: 260 }, { size: 76, weight: 800, color: ink, lineHeight: 1.08,
      ai: 'Judul satu poin tips yang konkret', length: 'medium', role: 'judul' }),
    text(ctx, 'Isi', 'Hal sederhana ini bikin orang merasa diingat. Catat nama pelanggan tetap dan sebut saat mereka datang lagi.', { x: 88, y: 680, w: 904, h: ctx.h - 840 },
      { size: 40, color: muted, lineHeight: 1.4, ai: 'Penjelasan singkat dan praktis untuk poin ini', length: 'long', role: 'isi' }),
  ] }) },
  { id: 'content-checklist', category: 'content', name: { id: 'Isi · Checklist', en: 'Content · Checklist' }, build: ctx => {
    const rows = [0, 1, 2, 3]
    const top = 340, gap = Math.round((ctx.h - top - 120) / 4)
    return { background: solid(lavender), children: [
      text(ctx, 'Judul', 'Checklist sebelum posting', { x: 88, y: 120, w: 904, h: 180 }, { size: 76, weight: 800, color: ink, lineHeight: 1.05,
        ai: 'Judul daftar periksa tentang topik', length: 'short', role: 'judul' }),
      ...rows.flatMap(i => [
        shape(ctx, `Centang ${i + 1}`, 'rect', { x: 88, y: top + i * gap + 6, w: 64, h: 64 }, solid(violet), { radius: 18 }),
        text(ctx, `Tanda ${i + 1}`, '✓', { x: 88, y: top + i * gap + 6, w: 64, h: 64 }, { size: 40, weight: 800, color: '#ffffff', align: 'center', valign: 'middle', role: 'lainnya' }),
        text(ctx, `Poin ${i + 1}`, ['Foto terang dan tajam', 'Caption punya ajakan', 'Hashtag relevan', 'Jam posting tepat'][i], { x: 184, y: top + i * gap, w: 808, h: gap - 24 },
          { size: 44, weight: 600, color: ink, lineHeight: 1.2, ai: `Poin checklist ke-${i + 1}, singkat`, length: 'short', role: 'isi' }),
      ]),
    ] }
  } },
  { id: 'content-photo-caption', category: 'content', name: { id: 'Isi · Foto + keterangan', en: 'Content · Photo + caption' }, build: ctx => ({ background: solid('#ffffff'), children: [
    photo(ctx, 'Foto', { x: 64, y: 64, w: W - 128, h: Math.round(ctx.h * 0.58) }, 'foto pendukung poin', ['#c9e4f5', '#6aa7d6'], 36),
    text(ctx, 'Judul', 'Tata etalase dari mata pelanggan', { x: 88, y: Math.round(ctx.h * 0.58) + 120, w: 904, h: 170 }, { size: 64, weight: 800, color: ink, lineHeight: 1.08,
      ai: 'Judul singkat untuk poin ini', length: 'short', role: 'judul' }),
    text(ctx, 'Isi', 'Letakkan produk terlaris setinggi mata, bukan di rak paling bawah.', { x: 88, y: Math.round(ctx.h * 0.58) + 300, w: 904, h: ctx.h - Math.round(ctx.h * 0.58) - 360 },
      { size: 38, color: muted, lineHeight: 1.4, ai: 'Penjelasan singkat poin ini', length: 'medium', role: 'isi' }),
  ] }) },
  { id: 'content-compare', category: 'content', name: { id: 'Isi · Perbandingan', en: 'Content · Two-up compare' }, build: ctx => {
    const colW = 440, top = 320, colH = ctx.h - top - 120
    return { background: solid('#ffffff'), children: [
      text(ctx, 'Judul', 'Sebelum vs sesudah', { x: 88, y: 120, w: 904, h: 150 }, { size: 76, weight: 800, color: ink, ai: 'Judul perbandingan dua kondisi', length: 'short', role: 'judul' }),
      shape(ctx, 'Kolom kiri', 'rect', { x: 88, y: top, w: colW, h: colH }, solid('#fdecea'), { radius: 32 }),
      shape(ctx, 'Kolom kanan', 'rect', { x: 552, y: top, w: colW, h: colH }, solid(mint), { radius: 32 }),
      text(ctx, 'Label kiri', 'SEBELUM', { x: 128, y: top + 48, w: 360, h: 50 }, { size: 30, weight: 800, color: '#b3261e', spacing: 10, upper: true, role: 'lainnya' }),
      text(ctx, 'Label kanan', 'SESUDAH', { x: 592, y: top + 48, w: 360, h: 50 }, { size: 30, weight: 800, color: '#0b5c3b', spacing: 10, upper: true, role: 'lainnya' }),
      text(ctx, 'Isi kiri', 'Posting kalau sempat, tanpa rencana', { x: 128, y: top + 130, w: 360, h: colH - 180 }, { size: 44, weight: 600, color: ink, lineHeight: 1.25,
        ai: 'Kondisi sebelum / cara yang salah', length: 'medium', role: 'isi' }),
      text(ctx, 'Isi kanan', 'Kalender konten seminggu, jadwal otomatis', { x: 592, y: top + 130, w: 360, h: colH - 180 }, { size: 44, weight: 600, color: ink, lineHeight: 1.25,
        ai: 'Kondisi sesudah / cara yang benar', length: 'medium', role: 'isi' }),
    ] }
  } },
  { id: 'content-steps', category: 'content', name: { id: 'Isi · Langkah', en: 'Content · Steps' }, build: ctx => {
    const top = 330, gap = Math.round((ctx.h - top - 100) / 3)
    return { background: solid(cream), children: [
      text(ctx, 'Judul', '3 langkah mulai hari ini', { x: 88, y: 120, w: 904, h: 170 }, { size: 76, weight: 800, color: ink, ai: 'Judul berisi jumlah langkah', length: 'short', role: 'judul' }),
      ...[0, 1, 2].flatMap(i => [
        shape(ctx, `Bulatan ${i + 1}`, 'ellipse', { x: 88, y: top + i * gap, w: 96, h: 96 }, solid(coral)),
        text(ctx, `Angka ${i + 1}`, String(i + 1), { x: 88, y: top + i * gap, w: 96, h: 96 }, { size: 48, weight: 800, color: '#ffffff', align: 'center', valign: 'middle', role: 'lainnya' }),
        text(ctx, `Langkah ${i + 1}`, ['Tentukan 3 pilar konten', 'Siapkan 7 ide sekaligus', 'Jadwalkan di kalender'][i], { x: 220, y: top + i * gap + 10, w: 772, h: gap - 40 },
          { size: 46, weight: 700, color: ink, lineHeight: 1.2, ai: `Langkah ke-${i + 1} yang singkat dan bisa langsung dilakukan`, length: 'short', role: 'isi' }),
      ]),
    ] }
  } },
  { id: 'content-myth', category: 'content', name: { id: 'Isi · Mitos vs fakta', en: 'Content · Myth vs fact' }, build: ctx => {
    const half = Math.round(ctx.h / 2)
    return { background: solid('#ffffff'), children: [
      shape(ctx, 'Latar mitos', 'rect', { x: 0, y: 0, w: W, h: half }, solid('#2a2c3d')),
      text(ctx, 'Label mitos', 'MITOS', { x: 88, y: 110, w: 400, h: 50 }, { size: 34, weight: 800, color: '#ff8a80', spacing: 12, upper: true, role: 'lainnya' }),
      text(ctx, 'Mitos', 'Posting tiap hari pasti bikin akun naik', { x: 88, y: 190, w: 904, h: half - 260 }, { size: 64, weight: 700, color: '#ffffff', lineHeight: 1.12,
        ai: 'Satu mitos umum tentang topik', length: 'medium', role: 'isi' }),
      text(ctx, 'Label fakta', 'FAKTA', { x: 88, y: half + 90, w: 400, h: 50 }, { size: 34, weight: 800, color: '#0b5c3b', spacing: 12, upper: true, role: 'lainnya' }),
      text(ctx, 'Fakta', 'Konsistensi dan kualitas lebih penting dari frekuensi', { x: 88, y: half + 170, w: 904, h: half - 260 }, { size: 64, weight: 700, color: ink, lineHeight: 1.12,
        ai: 'Fakta yang meluruskan mitos tersebut', length: 'medium', role: 'isi' }),
    ] }
  } },
  { id: 'content-tip-card', category: 'content', name: { id: 'Isi · Kartu tips', en: 'Content · Tip card' }, build: ctx => {
    const card = { x: 72, y: 200, w: W - 144, h: ctx.h - 400 }
    const body = text(ctx, 'Isi', 'Balas komentar dalam satu jam pertama. Algoritma membaca interaksi awal sebagai sinyal konten yang menarik.', { x: 136, y: 470, w: W - 272, h: card.h - 330 },
      { size: 44, color: ink, lineHeight: 1.4, ai: 'Isi tips yang jelas dan bisa dipraktikkan', length: 'long', role: 'isi' })
    return { background: gradient(135, '#6558f5', '#9b8cff'), children: [
      shape(ctx, 'Kartu', 'rect', card, solid('#ffffff'), { radius: 48 }),
      text(ctx, 'Label', '💡 TIPS', { x: 136, y: 270, w: 400, h: 50 }, { size: 32, weight: 800, color: violet, spacing: 8, role: 'lainnya' }),
      text(ctx, 'Judul', 'Jam emas setelah posting', { x: 136, y: 340, w: W - 272, h: 110 }, { size: 60, weight: 800, color: ink, ai: 'Judul tips singkat', length: 'short', role: 'judul' }),
      body,
    ] }
  } },
  { id: 'content-list-photo', category: 'content', name: { id: 'Isi · Daftar + foto', en: 'Content · List with photo' }, build: ctx => ({ background: solid('#ffffff'), children: [
    photo(ctx, 'Foto', { x: 560, y: 0, w: 520, h: ctx.h }, 'foto vertikal pendukung', ['#b8f3d6', '#1f4d3a']),
    text(ctx, 'Judul', 'Menu wajib coba', { x: 72, y: 120, w: 440, h: 220 }, { size: 72, weight: 800, color: ink, lineHeight: 1.05, ai: 'Judul daftar', length: 'short', role: 'judul' }),
    text(ctx, 'Daftar', '• Kopi susu aren\n• Croissant mentega\n• Teh melati dingin\n• Roti bakar keju', { x: 72, y: 380, w: 450, h: ctx.h - 500 },
      { size: 44, weight: 500, color: ink, lineHeight: 1.6, ai: 'Daftar 4 item pendek, satu per baris diawali •', length: 'auto', role: 'isi' }),
  ] }) },
  // ---------- Data ----------
  { id: 'data-big-number', category: 'data', name: { id: 'Data · Angka besar', en: 'Data · Big number' }, build: ctx => ({ background: solid(navy), children: [
    text(ctx, 'Angka', '73%', { x: 88, y: Math.round(ctx.h * 0.18), w: 904, h: 360 }, { size: 300, weight: 800, color: mint, lineHeight: 1,
      ai: 'Satu angka statistik yang mengejutkan tentang topik (hanya angka dan satuan)', length: 'short', role: 'judul' }),
    text(ctx, 'Keterangan', 'pembeli mengecek Instagram toko sebelum datang langsung', { x: 88, y: Math.round(ctx.h * 0.18) + 400, w: 904, h: 300 }, { size: 56, weight: 600, color: '#ffffff', lineHeight: 1.2,
      ai: 'Penjelasan singkat angka tersebut', length: 'medium', role: 'isi' }),
    text(ctx, 'Sumber', 'Sumber: survei internal', { x: 88, y: ctx.h - 140, w: 904, h: 50 }, { size: 28, color: '#9aa3c7', ai: 'Sumber data singkat', length: 'short', role: 'lainnya' }),
  ] }) },
  { id: 'data-two-numbers', category: 'data', name: { id: 'Data · Dua angka', en: 'Data · Two numbers' }, build: ctx => {
    const top = 360, colH = ctx.h - top - 140
    return { background: solid('#ffffff'), children: [
      text(ctx, 'Judul', 'Hasil 30 hari pertama', { x: 88, y: 120, w: 904, h: 160 }, { size: 72, weight: 800, color: ink, ai: 'Judul hasil atau perbandingan angka', length: 'short', role: 'judul' }),
      ...[0, 1].flatMap(i => [
        shape(ctx, `Kotak ${i + 1}`, 'rect', { x: 88 + i * 464, y: top, w: 440, h: colH }, solid(i ? mint : lavender), { radius: 36 }),
        text(ctx, `Angka ${i + 1}`, ['+120%', '3x'][i], { x: 128 + i * 464, y: top + 60, w: 360, h: 200 }, { size: 120, weight: 800, color: i ? '#0b5c3b' : violet,
          ai: `Angka ke-${i + 1} (singkat)`, length: 'short', role: 'judul' }),
        text(ctx, `Keterangan ${i + 1}`, ['jangkauan akun', 'pesan masuk'][i], { x: 128 + i * 464, y: top + 290, w: 360, h: colH - 340 }, { size: 42, weight: 600, color: ink, lineHeight: 1.25,
          ai: `Keterangan angka ke-${i + 1}`, length: 'short', role: 'isi' }),
      ]),
    ] }
  } },
  { id: 'data-bars', category: 'data', name: { id: 'Data · Grafik batang', en: 'Data · Bar chart' }, build: ctx => {
    const base = ctx.h - 200, values = [0.35, 0.55, 0.75, 1]
    return { background: solid(cream), children: [
      text(ctx, 'Judul', 'Pertumbuhan pengikut', { x: 88, y: 120, w: 904, h: 150 }, { size: 72, weight: 800, color: ink, ai: 'Judul grafik pertumbuhan', length: 'short', role: 'judul' }),
      ...values.flatMap((v, i) => {
        const h = Math.round((base - 400) * v)
        return [shape(ctx, `Batang ${i + 1}`, 'rect', { x: 120 + i * 220, y: base - h, w: 160, h }, solid(i === 3 ? coral : '#e5d6bf'), { radius: 20 }),
          text(ctx, `Label ${i + 1}`, ['Jan', 'Feb', 'Mar', 'Apr'][i], { x: 120 + i * 220, y: base + 24, w: 160, h: 50 }, { size: 32, weight: 600, color: muted, align: 'center', role: 'lainnya' })]
      }),
      text(ctx, 'Sorotan', '+185%', { x: 780, y: base - Math.round((base - 400) * 1) - 90, w: 260, h: 80 }, { size: 52, weight: 800, color: coral, align: 'center', ai: 'Angka sorotan pertumbuhan', length: 'short', role: 'lainnya' }),
    ] }
  } },
  // ---------- Kutipan ----------
  { id: 'quote-classic', category: 'quote', name: { id: 'Kutipan · Klasik', en: 'Quote · Classic' }, build: ctx => ({ background: solid('#fbfaf7'), children: [
    text(ctx, 'Tanda kutip', '“', { x: 72, y: 60, w: 300, h: 300 }, { size: 320, font: 'Playfair Display', color: violet, role: 'lainnya' }),
    text(ctx, 'Kutipan', 'Pelanggan tidak membeli produk. Mereka membeli versi terbaik dari diri mereka.', { x: 88, y: 340, w: 904, h: ctx.h - 640 },
      { size: 68, font: 'Playfair Display', italic: true, color: ink, lineHeight: 1.25, ai: 'Kutipan inspiratif relevan dengan topik', length: 'long', role: 'isi' }),
    text(ctx, 'Nama', '— Samuel Hulick', { x: 88, y: ctx.h - 220, w: 904, h: 60 }, { size: 38, weight: 600, color: muted, ai: 'Nama tokoh pemilik kutipan', length: 'short', role: 'lainnya' }),
  ] }) },
  { id: 'quote-testimonial', category: 'quote', name: { id: 'Kutipan · Testimoni', en: 'Quote · Testimonial' }, build: ctx => ({ background: solid(lavender), children: [
    shape(ctx, 'Kartu', 'rect', { x: 72, y: 200, w: W - 144, h: ctx.h - 400 }, solid('#ffffff'), { radius: 48 }),
    text(ctx, 'Bintang', '★★★★★', { x: 136, y: 280, w: 600, h: 70 }, { size: 56, color: '#f5a623', spacing: 8, role: 'lainnya' }),
    text(ctx, 'Testimoni', 'Kopinya konsisten enak, tempatnya nyaman buat kerja seharian. Sudah langganan 6 bulan!', { x: 136, y: 390, w: W - 272, h: ctx.h - 820 },
      { size: 52, weight: 600, color: ink, lineHeight: 1.3, ai: 'Testimoni pelanggan yang terdengar natural', length: 'long', role: 'isi' }),
    photo(ctx, 'Foto pelanggan', { x: 136, y: ctx.h - 380, w: 110, h: 110 }, 'foto wajah pelanggan', ['#ffd166', '#ff6b4a'], 55),
    text(ctx, 'Nama', 'Rina, Bandung', { x: 272, y: ctx.h - 360, w: 600, h: 70 }, { size: 40, weight: 700, color: ink, ai: 'Nama dan kota pelanggan', length: 'short', role: 'lainnya' }),
  ] }) },
  { id: 'quote-statement', category: 'quote', name: { id: 'Kutipan · Pernyataan besar', en: 'Quote · Big statement' }, build: ctx => ({ background: solid(coral), children: [
    text(ctx, 'Pernyataan', 'Konten bagus bukan yang viral, tapi yang bikin orang percaya.', { x: 88, y: 120, w: 904, h: ctx.h - 240 },
      { size: 104, weight: 800, color: '#ffffff', lineHeight: 1.04, valign: 'middle', ai: 'Satu pernyataan tegas yang mudah diingat', length: 'medium', role: 'judul' }),
  ] }) },
  // ---------- CTA ----------
  { id: 'cta-follow', category: 'cta', name: { id: 'Penutup · Ikuti akun', en: 'Closing · Follow' }, build: ctx => ({ background: solid(violet), children: [
    text(ctx, 'Judul', 'Bermanfaat? Simpan dan bagikan ke temanmu', { x: 88, y: Math.round(ctx.h * 0.22), w: 904, h: 420 }, { size: 88, weight: 800, color: '#ffffff', lineHeight: 1.06,
      ai: 'Ajakan menyimpan dan membagikan konten', length: 'medium', role: 'cta' }),
    shape(ctx, 'Tombol', 'rect', { x: 88, y: ctx.h - 360, w: 560, h: 120 }, solid('#ffffff'), { radius: 60 }),
    text(ctx, 'Teks tombol', 'Ikuti @usernamekamu', { x: 88, y: ctx.h - 360, w: 560, h: 120 }, { size: 40, weight: 700, color: violet, align: 'center', valign: 'middle', role: 'cta' }),
  ] }) },
  { id: 'cta-dm', category: 'cta', name: { id: 'Penutup · Kirim DM', en: 'Closing · Send a DM' }, build: ctx => ({ background: solid('#ffffff'), children: [
    shape(ctx, 'Gelembung', 'rect', { x: 88, y: Math.round(ctx.h * 0.2), w: 904, h: 420 }, solid(lavender), { radius: 56 }),
    text(ctx, 'Judul', 'Mau dibantu pilih paket yang pas?', { x: 148, y: Math.round(ctx.h * 0.2) + 60, w: 784, h: 300 }, { size: 76, weight: 800, color: ink, lineHeight: 1.08, valign: 'middle',
      ai: 'Ajakan konsultasi lewat DM', length: 'medium', role: 'cta' }),
    text(ctx, 'Instruksi', 'Kirim DM kata “INFO” sekarang', { x: 88, y: ctx.h - 330, w: 904, h: 90 }, { size: 52, weight: 700, color: violet, align: 'center',
      ai: 'Instruksi DM singkat dengan kata kunci', length: 'short', role: 'cta' }),
  ] }) },
  { id: 'cta-link', category: 'cta', name: { id: 'Penutup · Link di bio', en: 'Closing · Link in bio' }, build: ctx => ({ background: gradient(160, navy, '#2b3a7a'), children: [
    text(ctx, 'Judul', 'Daftar sekarang, kuota terbatas', { x: 88, y: Math.round(ctx.h * 0.25), w: 904, h: 380 }, { size: 92, weight: 800, color: '#ffffff', lineHeight: 1.05,
      ai: 'Ajakan bertindak yang mendesak tapi jujur', length: 'medium', role: 'cta' }),
    shape(ctx, 'Tombol', 'rect', { x: 88, y: ctx.h - 360, w: 904, h: 130 }, solid(mint), { radius: 65 }),
    text(ctx, 'Teks tombol', 'Klik link di bio ↗', { x: 88, y: ctx.h - 360, w: 904, h: 130 }, { size: 46, weight: 800, color: navy, align: 'center', valign: 'middle', role: 'cta' }),
  ] }) },
  // ---------- Promo ----------
  { id: 'promo-discount', category: 'promo', name: { id: 'Promo · Diskon', en: 'Promo · Discount' }, build: ctx => ({ background: solid(sun), children: [
    text(ctx, 'Label', 'PROMO AKHIR PEKAN', { x: 88, y: 110, w: 904, h: 50 }, { size: 34, weight: 800, color: ink, spacing: 10, upper: true, role: 'lainnya' }),
    text(ctx, 'Diskon', '30%', { x: 88, y: 180, w: 904, h: 380 }, { size: 340, weight: 800, color: ink, lineHeight: 1, ai: 'Besar diskon (angka dan %)', length: 'short', role: 'judul' }),
    text(ctx, 'Produk', 'untuk semua menu kopi susu', { x: 88, y: 580, w: 904, h: 140 }, { size: 60, weight: 700, color: ink, ai: 'Produk yang didiskon', length: 'short', role: 'isi' }),
    photo(ctx, 'Foto produk', { x: 88, y: 760, w: 904, h: ctx.h - 940 }, 'foto produk promo', ['#ffe8a3', '#f5a623'], 40),
    text(ctx, 'Syarat', 'Berlaku 1–3 Nov · Selama persediaan ada', { x: 88, y: ctx.h - 140, w: 904, h: 50 }, { size: 28, color: '#5c4a00', ai: 'Periode dan syarat promo singkat', length: 'short', role: 'lainnya' }),
  ] }) },
  { id: 'promo-launch', category: 'promo', name: { id: 'Promo · Produk baru', en: 'Promo · New product' }, build: ctx => ({ background: solid(forest), children: [
    photo(ctx, 'Foto produk', { x: 140, y: 120, w: 800, h: Math.round(ctx.h * 0.5) }, 'foto produk baru di latar bersih', ['#b8f3d6', '#2f7a5c'], 400),
    shape(ctx, 'Lencana', 'ellipse', { x: 780, y: 100, w: 200, h: 200 }, solid(sun)),
    text(ctx, 'Teks lencana', 'BARU', { x: 780, y: 100, w: 200, h: 200 }, { size: 48, weight: 800, color: ink, align: 'center', valign: 'middle', role: 'lainnya' }),
    text(ctx, 'Judul', 'Matcha Latte Oat', { x: 88, y: Math.round(ctx.h * 0.5) + 180, w: 904, h: 150 }, { size: 92, weight: 800, color: '#ffffff', align: 'center',
      ai: 'Nama produk baru', length: 'short', role: 'judul' }),
    text(ctx, 'Isi', 'Creamy, tidak terlalu manis, cocok buat sore', { x: 88, y: Math.round(ctx.h * 0.5) + 340, w: 904, h: 120 }, { size: 42, color: '#d8efe3', align: 'center',
      ai: 'Deskripsi singkat produk', length: 'short', role: 'isi' }),
  ] }) },
  { id: 'promo-price', category: 'promo', name: { id: 'Promo · Harga paket', en: 'Promo · Price card' }, build: ctx => ({ background: solid('#ffffff'), children: [
    text(ctx, 'Judul', 'Paket Hemat Berdua', { x: 88, y: 120, w: 904, h: 140 }, { size: 80, weight: 800, color: ink, ai: 'Nama paket', length: 'short', role: 'judul' }),
    shape(ctx, 'Kartu harga', 'rect', { x: 88, y: 320, w: 904, h: ctx.h - 520 }, solid(lavender), { radius: 48 }),
    text(ctx, 'Isi paket', '2 kopi + 2 pastry pilihan', { x: 148, y: 390, w: 784, h: 120 }, { size: 48, weight: 600, color: ink, ai: 'Isi paket singkat', length: 'short', role: 'isi' }),
    text(ctx, 'Harga', 'Rp79.000', { x: 148, y: 540, w: 784, h: 200 }, { size: 150, weight: 800, color: violet, ai: 'Harga paket', length: 'short', role: 'judul' }),
    text(ctx, 'Harga coret', 'dari Rp96.000', { x: 148, y: 760, w: 784, h: 70 }, { size: 40, color: muted, ai: 'Harga normal sebelum diskon', length: 'short', role: 'lainnya' }),
    text(ctx, 'CTA', 'Pesan via WhatsApp', { x: 88, y: ctx.h - 160, w: 904, h: 70 }, { size: 42, weight: 700, color: ink, align: 'center', ai: 'Ajakan memesan singkat', length: 'short', role: 'cta' }),
  ] }) },
]

export const STARTER_TEMPLATES: readonly StarterTemplate[] = DEFS.map(({ id, category, name }) => ({ id, category, name }))

/** A fresh page of one starter in the given format. Fonts and ids are valid for parseDesignDoc. */
export function starterPage(id: string, format: StarterFormat, name = 'Slide'): DesignPage {
  const index = DEFS.findIndex(def => def.id === id)
  if (index < 0) throw new Error('starter_not_found')
  const { width, height } = STARTER_SIZES[format]
  const ctx: Ctx = { w: width, h: height, n: 0, prefix: `${String(index).padStart(2, '0')}${format === '1:1' ? '1' : '4'}` }
  const built = DEFS[index].build(ctx)
  return { id: nextId(ctx), name, width, height, background: built.background, children: built.children }
}

/** The format of a page, when it is one the starters come in. */
export function starterFormatOf(page: { width: number; height: number }): StarterFormat | null {
  return page.width === 1080 && page.height === 1080 ? '1:1' : page.width === 1080 && page.height === 1350 ? '4:5' : null
}
