import { describe, expect, it } from 'vitest'
import { PdfError, readPdfText } from './pdf-text'

/** A one-page PDF with one Helvetica text line and a valid xref table. */
function textPdf(text: string): Uint8Array {
  const stream = `BT /F1 18 Tf 20 100 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

describe('readPdfText', () => {
  it('extracts text with a page marker', async () => {
    await expect(readPdfText(textPdf('Halo Sigap brief brand'), 'brief.pdf')).resolves.toEqual({
      text: 'Halo Sigap brief brand\n\n[Halaman 1]',
      pages: 1,
      cut: false,
    })
  })

  it('does not count its page marker as readable text', async () => {
    await expect(readPdfText(textPdf(''), 'scan.pdf')).rejects.toMatchObject({
      message: 'scan.pdf tidak berisi teks yang bisa dibaca (mungkin hasil scan).',
    })
  })

  it('turns a broken PDF into a safe owner-facing error', async () => {
    const error = await readPdfText(new TextEncoder().encode('bukan pdf'), 'rusak.pdf').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PdfError)
    expect(error).toMatchObject({
      message: 'rusak.pdf tidak bisa dibaca. Pastikan PDF tidak rusak atau terkunci kata sandi.',
    })
  })
})
