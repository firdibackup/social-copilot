import { lookup } from 'node:dns/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cssColors, cssFonts, extractWebsite, prioritizeWebsiteLinks, readWebsite } from './website'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

const PAGE = `<!doctype html>
<html>
<head>
  <title>Kopi Sinar &amp; Roastery</title>
  <meta name="description" content="Kopi susu  gula aren dari Bandung.">
  <meta property="og:image" content="/og.jpg">
  <meta name="theme-color" content="#7A3E1D">
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="https://cdn.other.com/lib.css">
  <link rel="icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/touch.png">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <style>.hero { color: #7a3e1d; background: rgb(250, 245, 238); }</style>
  <script>var secret = "not page text";</script>
</head>
<body>
  <header><img src="/img/logo-sinar.png" alt="Kopi Sinar" class="site-logo"></header>
  <!-- hidden comment -->
  <h1>Ngopi santai, kak!</h1>
  <p style="color:#E8B04B">Buka setiap hari 08.00&ndash;22.00 &#8212; Jl. Braga 1</p>
  <a href="/tentang">Tentang</a><a href="/produk/kopi">Produk</a>
  <img src="/img/kopi.jpg" alt="Kopi susu" width="800" height="1000">
  <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-src="/img/lazy.jpg" alt="Kopi lazy">
</body>
</html>`

describe('extractWebsite', () => {
  const page = extractWebsite(PAGE, 'https://kopisinar.id/')

  it('reads the title, description and visible text', () => {
    expect(page.title).toBe('Kopi Sinar & Roastery')
    expect(page.description).toBe('Kopi susu gula aren dari Bandung.')
    expect(page.text).toContain('Ngopi santai, kak!')
    expect(page.text).toContain('— Jl. Braga 1')
    expect(page.text).not.toContain('secret')
    expect(page.text).not.toContain('hidden comment')
  })

  it('puts the site’s own stylesheets first and skips font CSS', () => {
    expect(page.stylesheetUrls).toEqual(['https://kopisinar.id/assets/site.css', 'https://cdn.other.com/lib.css'])
  })

  it('offers the logo image and touch icon first, and no .ico', () => {
    expect(page.logoUrls).toEqual([
      'https://kopisinar.id/img/logo-sinar.png',
      'https://kopisinar.id/touch.png',
      'https://kopisinar.id/og.jpg',
    ])
    expect(page.imageUrls).toEqual([
      'https://kopisinar.id/img/kopi.jpg',
      'https://kopisinar.id/img/lazy.jpg',
      'https://kopisinar.id/og.jpg',
    ])
  })

  it('reads internal links and ordinary content images with context', () => {
    expect(page.links).toEqual(['https://kopisinar.id/tentang', 'https://kopisinar.id/produk/kopi'])
    expect(page.images).toContainEqual(
      expect.objectContaining({ url: 'https://kopisinar.id/img/kopi.jpg', alt: 'Kopi susu', width: 800, height: 1000 }),
    )
    expect(page.images).toContainEqual(expect.objectContaining({ url: 'https://kopisinar.id/img/lazy.jpg', alt: 'Kopi lazy' }))
  })

  it('reads the theme colour, Google Fonts and inline CSS', () => {
    expect(page.themeColor).toBe('#7a3e1d')
    expect(page.linkedFonts).toEqual(['Playfair Display', 'Inter'])
    expect(page.inlineCss).toContain('#7a3e1d')
    expect(page.inlineCss).toContain('#E8B04B')
  })
})

describe('cssColors', () => {
  it('puts the theme colour first, then colourful values by use, then at most two neutrals', () => {
    const css = `
      a { color: #e8b04b; } b { color: #E8B04B; } c { border-color: #1d4ed8 }
      d { color: #fff } e { color: #000 } f { color: #777777 } g { background: rgba(0, 0, 0, .1) }
      #add:hover { color: #ffffff }`

    expect(cssColors(css, '#7a3e1d')).toEqual(['#7a3e1d', '#e8b04b', '#1d4ed8', '#ffffff', '#000000'])
  })

  it('does not read selectors such as #add as colours', () => {
    expect(cssColors('#add, #bad { margin: 0 }')).toEqual([])
  })

  it('drops mostly transparent colours', () => {
    expect(cssColors('a { color: #ff000033; background: rgba(0, 128, 255, 0.8) }')).toEqual(['#0080ff'])
  })
})

describe('cssFonts', () => {
  it('lists linked fonts first, then the first family of each declaration by use', () => {
    const css = `body { font-family: "Inter", sans-serif } h1 { font-family: 'Lora', serif } p { font-family: Lora }
      code { font-family: ui-monospace, monospace } x { font-family: var(--font) }`

    expect(cssFonts(css, ['Playfair Display', 'inter'])).toEqual(['Playfair Display', 'inter', 'Lora'])
  })

  it('drops !important and icon fonts', () => {
    const css = `a { font-family: "Plus Jakarta Sans" !important } i { font-family: FontAwesome } b { font-family: 'Glyphicons Halflings' }`

    expect(cssFonts(css)).toEqual(['Plus Jakarta Sans'])
  })
})

describe('prioritizeWebsiteLinks', () => {
  it('puts product pages first and excludes unsafe or irrelevant pages', () => {
    expect(
      prioritizeWebsiteLinks(
        [
          'https://kopisinar.id/tentang',
          'https://kopisinar.id/checkout',
          'https://other.id/product',
          'https://kopisinar.id/produk/kopi',
        ],
        'https://kopisinar.id/',
      ),
    ).toEqual(['https://kopisinar.id/produk/kopi', 'https://kopisinar.id/tentang'])
  })
})

describe('readWebsite', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(lookup).mockResolvedValue([{ address: '203.0.113.10', family: 4 }] as never)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('reads the page and its stylesheets', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('site.css')) return new Response('.btn { background: #1d4ed8; font-family: Lora }')
      if (url.endsWith('lib.css')) return new Response('.x { color: #123456 }')
      return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    })

    const facts = await readWebsite('kopisinar.id')

    expect(facts.url).toBe('https://kopisinar.id/')
    expect(facts.colors.slice(0, 4)).toEqual(['#7a3e1d', '#e8b04b', '#1d4ed8', '#123456'])
    expect(facts.fonts).toEqual(['Playfair Display', 'Inter', 'Lora'])
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(facts.pages).toHaveLength(3)
  })

  it('still answers when a stylesheet fails', async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('.css')
        ? new Response('gone', { status: 404 })
        : new Response(PAGE, { headers: { 'content-type': 'text/html' } }),
    )

    await expect(readWebsite('https://kopisinar.id')).resolves.toMatchObject({ title: 'Kopi Sinar & Roastery' })
  })

  it('rejects something that is not a web page', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } }))

    await expect(readWebsite('kopisinar.id')).rejects.toThrow('Alamat itu bukan halaman web.')
  })
})
