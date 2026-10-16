import 'server-only'
import { normalizeHex, normalizeWebsiteUrl, truncate } from './brand-options'
import { fetchPublic, RemoteFetchError } from './web-fetch'

const HTML_MAX_BYTES = 2 * 1024 * 1024
const CSS_MAX_BYTES = 512 * 1024
const MAX_STYLESHEETS = 3
/** Enough page text for the AI to see what the brand sells and how it talks. */
const TEXT_MAX_LENGTH = 6000
const MAX_COLORS = 8
const MAX_NEUTRALS = 2
const MAX_FONTS = 6
const MAX_LOGOS = 4
const MAX_IMAGES = 4
/** Channel spread under which a colour reads as white, black or grey. */
const NEUTRAL_CHROMA = 24
const FONT_CSS_HOSTS = new Set(['fonts.googleapis.com', 'use.typekit.net', 'fonts.bunny.net'])

/** What the page itself says, before any stylesheet is fetched. */
export interface ExtractedPage {
  title: string
  description: string
  text: string
  themeColor: string | null
  /** The site's own first, then CDN-hosted ones. */
  stylesheetUrls: string[]
  /** `<style>` blocks and `style` attributes. */
  inlineCss: string
  /** Families requested from Google Fonts. */
  linkedFonts: string[]
  logoUrls: string[]
  imageUrls: string[]
}

export interface WebsiteFacts {
  url: string
  title: string
  description: string
  text: string
  colors: string[]
  fonts: string[]
  logoUrls: string[]
  imageUrls: string[]
}

/** The named entities Indonesian sites commonly use; numeric ones are decoded generally. */
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? match
    const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match
  })
}

const ATTRIBUTE = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

/** Attributes of every `<name …>` tag. Names are lowercased, values decoded. */
function tagsOf(html: string, name: string): Record<string, string>[] {
  const tags: Record<string, string>[] = []
  for (const [, body] of html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))) {
    const attributes: Record<string, string> = {}
    for (const [, key, double, single, bare] of body.matchAll(ATTRIBUTE)) {
      attributes[key.toLowerCase()] = decodeEntities(double ?? single ?? bare ?? '')
    }
    tags.push(attributes)
  }
  return tags
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

function resolve(href: string | undefined, base: string): string | null {
  if (!href || href.startsWith('data:')) return null
  try {
    const url = new URL(href, base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/** SVG and .ico can't be stored as references or logos, so they are not offered. */
const isRasterUrl = (url: string) => !/\.(svg|ico)(\?|#|$)/i.test(url)

const unique = (items: (string | null)[]) => [...new Set(items.filter((item): item is string => item !== null))]

function visibleText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  return truncate(collapse(decodeEntities(stripped)), TEXT_MAX_LENGTH)
}

function googleFontFamilies(href: string): string[] {
  try {
    const url = new URL(href)
    if (url.hostname !== 'fonts.googleapis.com') return []
    // css2 repeats `family=`; the old css API joins families with `|`.
    return url.searchParams
      .getAll('family')
      .flatMap((value) => value.split('|'))
      .map((family) => family.split(':')[0].replace(/\+/g, ' ').trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/** Reads one HTML page. `pageUrl` resolves relative links and decides which stylesheets are the site's own. */
export function extractWebsite(html: string, pageUrl: string): ExtractedPage {
  const meta = new Map<string, string>()
  for (const tag of tagsOf(html, 'meta')) {
    const key = (tag.property ?? tag.name ?? '').toLowerCase()
    if (key && tag.content && !meta.has(key)) meta.set(key, collapse(tag.content))
  }
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const links = tagsOf(html, 'link')
  const rels = (tag: Record<string, string>) => (tag.rel ?? '').toLowerCase().split(/\s+/)
  const host = new URL(pageUrl).hostname

  // Site builders (Squarespace, Wix…) serve the site's CSS from their CDN, so other hosts count too, after the
  // site's own. Font CSS carries no colours.
  const stylesheetUrls = links
    .filter((tag) => rels(tag).includes('stylesheet'))
    .map((tag) => resolve(tag.href, pageUrl))
    .filter((url): url is string => url !== null && !FONT_CSS_HOSTS.has(new URL(url).hostname))
    .sort((a, b) => Number(new URL(b).hostname === host) - Number(new URL(a).hostname === host))
    .slice(0, MAX_STYLESHEETS)
  const linkedFonts = links.flatMap((tag) => (tag.href ? googleFontFamilies(resolve(tag.href, pageUrl) ?? '') : []))

  const logoImages = tagsOf(html, 'img')
    .filter((tag) => /logo/i.test([tag.src, tag.alt, tag.class, tag.id].join(' ')))
    .map((tag) => resolve(tag.src ?? tag['data-src'], pageUrl))
  const icons = links
    .filter((tag) => rels(tag).some((rel) => rel === 'icon' || rel === 'apple-touch-icon'))
    .sort((a, b) => Number(rels(b).includes('apple-touch-icon')) - Number(rels(a).includes('apple-touch-icon')))
    .map((tag) => resolve(tag.href, pageUrl))
  const ogImage = resolve(meta.get('og:image'), pageUrl)

  const inlineCss = [
    ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]),
    ...[...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((match) => `x{${decodeEntities(match[1])}}`),
  ].join('\n')

  return {
    title: collapse(decodeEntities(titleMatch?.[1] ?? '')) || meta.get('og:title') || '',
    description: meta.get('description') ?? meta.get('og:description') ?? '',
    text: visibleText(html),
    themeColor: normalizeHex(meta.get('theme-color') ?? ''),
    stylesheetUrls,
    inlineCss,
    linkedFonts,
    logoUrls: unique([...logoImages, ...icons, ogImage]).filter(isRasterUrl).slice(0, MAX_LOGOS),
    imageUrls: unique([ogImage, resolve(meta.get('twitter:image'), pageUrl)]).filter(isRasterUrl).slice(0, MAX_IMAGES),
  }
}

const HEX_COLOR = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi
const RGB_COLOR = /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)/gi

/** Colours in declaration values, as `#rrggbb`. Mostly transparent ones are skipped. */
function colorsIn(value: string): string[] {
  const colors: string[] = []
  for (const [, digits] of value.matchAll(HEX_COLOR)) {
    const alpha = digits.length === 4 ? digits[3] + digits[3] : digits.length === 8 ? digits.slice(6) : 'ff'
    if (parseInt(alpha, 16) < 128) continue
    const rgb = digits.length <= 4 ? digits.slice(0, 3) : digits.slice(0, 6)
    const hex = normalizeHex(rgb)
    if (hex) colors.push(hex)
  }
  for (const [, r, g, b, alpha, percent] of value.matchAll(RGB_COLOR)) {
    const opacity = alpha === undefined ? 1 : Number(alpha) / (percent ? 100 : 1)
    const channels = [r, g, b].map(Number)
    if (opacity < 0.5 || channels.some((channel) => channel > 255)) continue
    colors.push(`#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`)
  }
  return colors
}

const chroma = (hex: string) => {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
  return Math.max(...channels) - Math.min(...channels)
}

const byCount = (counts: Map<string, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key)

/**
 * Brand colour candidates from CSS: the theme colour, then the most used colourful values, then at most two
 * neutrals. Only declaration values are read, so selectors like `#add` don't count as colours.
 */
export function cssColors(css: string, themeColor: string | null = null): string[] {
  const counts = new Map<string, number>()
  for (const [, value] of css.matchAll(/:([^;{}]+)/g)) {
    for (const color of colorsIn(value)) counts.set(color, (counts.get(color) ?? 0) + 1)
  }
  const ranked = byCount(counts)
  const colorful = ranked.filter((hex) => chroma(hex) >= NEUTRAL_CHROMA)
  const neutrals = ranked.filter((hex) => chroma(hex) < NEUTRAL_CHROMA).slice(0, MAX_NEUTRALS)
  return unique([themeColor, ...colorful, ...neutrals]).slice(0, MAX_COLORS)
}

const GENERIC_FONTS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  '-apple-system',
  'blinkmacsystemfont',
  'emoji',
  'math',
  'fangsong',
  'inherit',
  'initial',
  'unset',
  'revert',
])

/** Icon fonts are declared like text fonts but are no use in a brand kit. */
const ICON_FONT = /icon|awesome|glyph|material symbols/i

/** Font families named first in `font-family` declarations, most used first, generic and icon fonts left out. */
export function cssFonts(css: string, linkedFonts: string[] = []): string[] {
  const counts = new Map<string, number>()
  for (const [, list] of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const first = list.replace(/!important/i, '').split(',')[0]
    const family = first.trim().replace(/^["']|["']$/g, '').trim()
    if (!family || family.startsWith('var(') || GENERIC_FONTS.has(family.toLowerCase()) || ICON_FONT.test(family)) continue
    counts.set(family, (counts.get(family) ?? 0) + 1)
  }
  const seen = new Set<string>()
  return [...linkedFonts, ...byCount(counts)]
    .filter((family) => {
      const key = family.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_FONTS)
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

/** Reads the homepage and up to three of its own stylesheets. Throws RemoteFetchError with an owner-facing message. */
export async function readWebsite(input: string): Promise<WebsiteFacts> {
  const url = normalizeWebsiteUrl(input)
  if (!url) throw new RemoteFetchError('Alamat website tidak valid.')
  // ponytail: decoded as UTF-8 whatever the charset says; nearly every site today is UTF-8.
  const page = await fetchPublic(url, HTML_MAX_BYTES)
  if (!/text\/html|application\/xhtml/i.test(page.contentType)) throw new RemoteFetchError('Alamat itu bukan halaman web.')

  const extracted = extractWebsite(decode(page.bytes), page.url)
  const sheets = await Promise.all(
    extracted.stylesheetUrls.map((sheet) => fetchPublic(sheet, CSS_MAX_BYTES).then((file) => decode(file.bytes), () => '')),
  )
  const css = [extracted.inlineCss, ...sheets].join('\n')
  return {
    url: page.url,
    title: extracted.title,
    description: extracted.description,
    text: extracted.text,
    colors: cssColors(css, extracted.themeColor),
    fonts: cssFonts(css, extracted.linkedFonts),
    logoUrls: extracted.logoUrls,
    imageUrls: extracted.imageUrls,
  }
}
