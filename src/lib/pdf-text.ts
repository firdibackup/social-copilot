import 'server-only'
import 'pdf-parse/worker'
import { PDFParse } from 'pdf-parse'

/** A PDF is a brief or a reference: its first pages carry what matters, and the text stays one request small. */
const MAX_PAGES = 30
const MAX_CHARS = 20_000
const PAGE_MARKS = /\[Halaman \d+\]/g

export interface PdfText {
  text: string
  pages: number
  /** Pages or characters were left out. */
  cut: boolean
}

/** The PDF can't be read: broken, encrypted, or not a PDF. The message is safe to show. */
export class PdfError extends Error {
  override name = 'PdfError'
}

/** The text of a PDF's first pages, for one Sigap request only: it is never stored. */
export async function readPdfText(bytes: Uint8Array, name: string): Promise<PdfText> {
  const parser = new PDFParse({ data: bytes })
  try {
    // Each page ends with its number, so the answer can point to a page of the brief.
    const result = await parser.getText({ first: MAX_PAGES, pageJoiner: '\n[Halaman page_number]' })
    const text = result.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    if (!text.replace(PAGE_MARKS, '').trim()) throw new PdfError(`${name} tidak berisi teks yang bisa dibaca (mungkin hasil scan).`)
    return { text: text.slice(0, MAX_CHARS), pages: result.total, cut: result.total > MAX_PAGES || text.length > MAX_CHARS }
  } catch (error) {
    if (error instanceof PdfError) throw error
    throw new PdfError(`${name} tidak bisa dibaca. Pastikan PDF tidak rusak atau terkunci kata sandi.`)
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}
