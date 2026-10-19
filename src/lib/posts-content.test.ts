import { beforeEach, describe, expect, it, vi } from 'vitest'
import { filtered, queryMock } from '@/test/query-mock'
import { createContentPost } from './posts'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))

beforeEach(() => vi.mocked(db).mockReset())

describe('createContentPost', () => {
  it('sends the selected product group and reference image for every slide', async () => {
    const { query, calls } = queryMock({ data: 'post-1', error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await createContentPost(
      'user-1',
      {
        topic: 'Kopi',
        slides: 1,
        format: '4:5',
        referenceId: null,
        productGroupId: 'auto',
        includeLogo: true,
        ideaId: null,
      },
      {
        title: 'Kopi',
        caption: 'Kopi pagi',
        slides: [
          {
            headline: 'Kopi pagi',
            scene: 'Botol di meja',
            productGroupId: '00000000-0000-4000-8000-000000000099',
            attachment: '',
          },
        ],
      },
      [{ role: null, referenceImageId: '00000000-0000-4000-8000-000000000001', example: null }],
    )

    const rpc = calls.find((call) => call[0] === 'rpc')
    expect(rpc?.[1]).toBe('create_content')
    expect(rpc?.[2]).toMatchObject({
      p_user_id: 'user-1',
      p_slides: [
        expect.objectContaining({
          reference_image_id: '00000000-0000-4000-8000-000000000001',
          product_group_id: '00000000-0000-4000-8000-000000000099',
        }),
      ],
    })
    expect(filtered(calls, 'user_id', 'user-1')).toBe(false)
  })

  it('sends each slide’s style example, and the attachment only to the slides that use it', async () => {
    const { query, calls } = queryMock({ data: 'post-1', error: null })
    vi.mocked(db).mockReturnValue(query as never)
    const path = 'user-1/lampiran/x.jpg'
    const slide = (attachment: string) => ({ headline: 'Kopi', scene: 'Meja', productGroupId: null, attachment })

    await createContentPost(
      'user-1',
      { topic: 'Kopi', slides: 2, format: '4:5', referenceId: 'auto', productGroupId: null, includeLogo: false, ideaId: null },
      { title: 'Kopi', caption: 'Kopi pagi', slides: [slide('Use it as the cover photo.'), slide('')] },
      [
        { role: 'cover', referenceImageId: null, example: 'bento-produk' },
        { role: 'isi', referenceImageId: null, example: null },
      ],
      path,
    )

    const rpc = calls.find((call) => call[0] === 'rpc')
    expect(rpc?.[2]).toMatchObject({
      p_slides: [
        expect.objectContaining({ example: 'bento-produk', attachment_path: path, attachment_note: 'Use it as the cover photo.' }),
        expect.objectContaining({ example: null, attachment_path: null, attachment_note: '' }),
      ],
    })
  })
})
