import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbMock } from '@/test/query-mock'
import { ATTACHMENT_MAX_LENGTH, loadAttachment, readAttachment, removeAttachment, saveAttachment } from './attachments'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))

const USER = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const PATH = `${USER}/lampiran/00000000-0000-4000-8000-000000000003.jpg`
const NOT_AN_IMAGE = { error: 'Lampiran harus berupa gambar.' }

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#ff0000' } }).png().toBuffer()
const dataUrl = (type: string, bytes: Buffer) => `data:${type};base64,${bytes.toString('base64')}`

function mockStorage() {
  const mock = dbMock([{ data: null, error: null }])
  const bucket = vi.spyOn(mock.client.storage, 'from')
  vi.mocked(db).mockReturnValue(mock.client as never)
  return { ...mock, bucket }
}

beforeEach(() => vi.mocked(db).mockReset())

describe('readAttachment', () => {
  it('has nothing to read without an attachment', async () => {
    for (const value of [null, undefined, '']) expect(await readAttachment(value)).toBeNull()
  })

  it('refuses anything but an image data URL', async () => {
    expect(await readAttachment(5)).toEqual(NOT_AN_IMAGE)
    expect(await readAttachment('data:text/html;base64,PGI+')).toEqual(NOT_AN_IMAGE)
    expect(await readAttachment('https://contoh.id/a.jpg')).toEqual(NOT_AN_IMAGE)
  })

  it('refuses a data URL over the limit', async () => {
    expect(await readAttachment(`data:image/jpeg;base64,${'A'.repeat(ATTACHMENT_MAX_LENGTH)}`)).toEqual({
      error: 'Gambar lampiran terlalu besar.',
    })
  })

  it('refuses bytes that are not an image', async () => {
    expect(await readAttachment(dataUrl('image/png', Buffer.from('bukan gambar')))).toEqual({
      error: 'Gambar lampiran tidak bisa dibaca.',
    })
  })

  it('refuses an image with more pixels than any photo needs, without decoding it', async () => {
    const huge = await sharp({ create: { width: 6500, height: 6500, channels: 3, background: '#ffffff' } })
      .png({ compressionLevel: 9 })
      .toBuffer()

    expect(await readAttachment(dataUrl('image/png', huge))).toEqual({ error: 'Gambar lampiran tidak bisa dibaca.' })
  })

  it('re-encodes an image as a 640 px JPEG, as a data URL and as bytes', async () => {
    const read = await readAttachment(dataUrl('image/png', await png(1200, 800)))

    if (!read || 'error' in read) throw new Error('expected an attachment')
    expect(read.dataUrl).toBe(`data:image/jpeg;base64,${Buffer.from(read.bytes).toString('base64')}`)
    const meta = await sharp(read.bytes).metadata()
    expect([meta.format, meta.width]).toEqual(['jpeg', 640])
  })
})

describe('saveAttachment', () => {
  it('stores the JPEG in the owner’s lampiran folder of the brand bucket', async () => {
    const { storage, bucket } = mockStorage()

    const path = await saveAttachment(USER, { dataUrl: 'data:image/jpeg;base64,AQI=', bytes: new Uint8Array([1, 2]) })

    expect(path).toMatch(new RegExp(`^${USER}/lampiran/[0-9a-f-]{36}\\.jpg$`))
    expect(bucket).toHaveBeenCalledWith('brand')
    expect(storage.upload).toHaveBeenCalledWith(path, expect.anything(), expect.objectContaining({ contentType: 'image/jpeg' }))
  })
})

describe('loadAttachment', () => {
  it('returns the stored image as a JPEG data URL', async () => {
    const { storage } = mockStorage()
    storage.download.mockResolvedValueOnce({ data: new Blob([new Uint8Array([1, 2])]), error: null })

    expect(await loadAttachment(USER, PATH)).toBe('data:image/jpeg;base64,AQI=')
    expect(storage.download).toHaveBeenCalledWith(PATH)
  })

  it('never downloads a path outside the user’s own lampiran folder', async () => {
    const { storage } = mockStorage()

    expect(await loadAttachment(OTHER, PATH)).toBeNull()
    expect(await loadAttachment(USER, `${USER}/logo.png`)).toBeNull()
    expect(storage.download).not.toHaveBeenCalled()
  })
})

describe('removeAttachment', () => {
  it('removes the file from the brand bucket', async () => {
    const { storage, bucket } = mockStorage()

    await removeAttachment(PATH)

    expect(bucket).toHaveBeenCalledWith('brand')
    expect(storage.removed).toEqual([PATH])
  })
})
