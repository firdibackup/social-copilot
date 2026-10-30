import { describe, expect, it } from 'vitest'
import { cleanScriptSlide, parseScript, readScriptText, scriptHeadline, scriptLines, scriptToText } from './script-options'

const SLIDE = { label: 'IN', title: 'IN = Di dalam', body: '- In the room — Di dalam ruangan' }

describe('scriptHeadline', () => {
  it('puts the title above the body and leaves out an empty part', () => {
    expect(scriptHeadline(SLIDE)).toBe('IN = Di dalam\n- In the room — Di dalam ruangan')
    expect(scriptHeadline({ ...SLIDE, body: '' })).toBe('IN = Di dalam')
    expect(scriptHeadline({ ...SLIDE, title: '' })).toBe('- In the room — Di dalam ruangan')
  })
})

describe('cleanScriptSlide', () => {
  it('reads nothing from a slide without text', () => {
    expect(cleanScriptSlide({ label: 'Hook', title: ' ', body: '' })).toBeNull()
    expect(cleanScriptSlide('Hook')).toBeNull()
  })
})

describe('parseScript', () => {
  it('accepts a script, trimmed, with CRLF as LF', () => {
    expect(parseScript([{ ...SLIDE, body: ' a\r\nb ' }])).toEqual({ script: [{ ...SLIDE, body: 'a\nb' }] })
  })

  it.each([
    ['an empty list', [], 'Skrip kosong.'],
    ['not a list', 'skrip', 'Skrip kosong.'],
    ['eleven slides', Array.from({ length: 11 }, () => SLIDE), 'Skrip maksimal 10 slide.'],
    ['a slide that is not an object', [SLIDE, 3], 'Skrip tidak valid.'],
    ['an empty slide', [SLIDE, { label: 'CTA', title: '', body: ' ' }], 'Slide 2 di skrip masih kosong.'],
  ])('refuses %s', (_label, value, error) => {
    expect(parseScript(value)).toEqual({ error })
  })

  it('refuses carousel image text over 300 code points', () => {
    const cta = { label: 'CTA', title: 'Ayo', body: '' }
    expect(parseScript([{ label: '', title: 'Judul', body: '😀'.repeat(294) }, cta])).toEqual({ script: expect.any(Array) })
    expect(parseScript([{ label: '', title: 'Judul', body: '😀'.repeat(295) }, cta])).toEqual({
      error: 'Teks slide 1 maksimal 300 karakter agar muat di gambar.',
    })
  })

  it('lets a single post carry up to 5,000 code points', () => {
    expect(parseScript([{ label: '', title: 'Judul', body: '😀'.repeat(4994) }])).toEqual({ script: expect.any(Array) })
    expect(parseScript([{ label: '', title: 'Judul', body: '😀'.repeat(4995) }])).toEqual({
      error: 'Teks single post maksimal 5.000 karakter.',
    })
  })
})

const SCRIPT = [
  { label: 'Hook', title: 'Biaya cooling membengkak', body: 'Banyak fasilitas boros tanpa sadar.' },
  { label: '', title: 'Cek efisiensi Anda', body: '- Hubungi kami\n- Audit gratis' },
]
const SCRIPT_TEXT =
  'Slide 1 — Hook\nBiaya cooling membengkak\nBanyak fasilitas boros tanpa sadar.\n\nSlide 2\nCek efisiensi Anda\n- Hubungi kami\n- Audit gratis'

describe('scriptToText', () => {
  it('writes each slide as its slide line, its title and its body, a blank line apart', () => {
    expect(scriptToText(SCRIPT)).toBe(SCRIPT_TEXT)
  })
})

describe('readScriptText', () => {
  it('reads the text back into the same script', () => {
    expect(readScriptText(SCRIPT_TEXT)).toEqual({ intro: '', script: SCRIPT })
  })

  it('reads text without slide lines as a plain topic', () => {
    expect(readScriptText('Tips hemat listrik untuk gedung')).toBeNull()
    expect(readScriptText('Slide 2 hari lagi kami rilis')).toBeNull()
  })

  it('takes the first line after a slide line as its title and keeps the text above slide 1 apart', () => {
    expect(readScriptText('Fokus ke biaya\r\n\nslide 1: Hook\n\n  Judul  \nisi satu\n\nisi dua\n\nSLIDE 2 - CTA\nAyo cek')).toEqual({
      intro: 'Fokus ke biaya',
      script: [
        { label: 'Hook', title: 'Judul', body: 'isi satu\n\nisi dua' },
        { label: 'CTA', title: 'Ayo cek', body: '' },
      ],
    })
  })

  it('refuses a slide line without text, and a slide over what fits on the image', () => {
    expect(readScriptText('Slide 1 — Hook\n\nSlide 2 — CTA\nAyo')).toEqual({ error: 'Slide 1 di skrip masih kosong.' })
    expect(readScriptText(`Slide 1\nJudul\n${'a'.repeat(300)}\n\nSlide 2\nAyo`)).toEqual({
      error: 'Teks slide 1 maksimal 300 karakter agar muat di gambar.',
    })
    expect(readScriptText(`Slide 1\nJudul\n${'a'.repeat(300)}`)).toMatchObject({ script: expect.any(Array) })
  })
})

describe('scriptLines', () => {
  it('names what each line is and which slide it belongs to', () => {
    expect(scriptLines('Arahan\nSlide 1 — Hook\n\nJudul\nIsi')).toEqual([
      { kind: 'intro', slide: -1 },
      { kind: 'slide', slide: 0 },
      { kind: 'body', slide: 0 },
      { kind: 'title', slide: 0 },
      { kind: 'body', slide: 0 },
    ])
  })
})
