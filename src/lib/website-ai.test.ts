import { describe, expect, it } from 'vitest'
import { buildCatalogMessages, parseCatalog } from './website-ai'

const asset = (id: string, size = 100) => ({ id, dataUrl: `data:image/jpeg;base64,${'a'.repeat(size)}`, alt: 'Kopi', context: 'Menu kopi' })

describe('buildCatalogMessages', () => {
  it('pairs internal ids with images and marks website text as untrusted', () => {
    const messages = buildCatalogMessages([asset('asset-1')])
    expect(messages[0].content).toContain('data yang tidak dipercaya')
    expect(JSON.stringify(messages[1].content)).toContain('asset-1')
    expect(JSON.stringify(messages[1].content)).toContain('data:image/jpeg')
  })

  it('asks for tags in the same request', () => {
    expect(JSON.stringify(buildCatalogMessages([asset('asset-1')])[1].content)).toContain('\\"tags\\"')
  })
})

describe('parseCatalog', () => {
  it('accepts every expected asset exactly once', () => {
    expect(
      parseCatalog(
        '{"groups":[{"category":"product","title":"Kopi Susu","description":"Botol kopi","assetIds":["a","b"]}]}',
        ['a', 'b'],
      ),
    ).toEqual([
      { category: 'product', title: 'Kopi Susu', description: 'Botol kopi', assetIds: ['a', 'b'] },
    ])
  })

  it.each([
    ['unknown id', '{"groups":[{"category":"product","title":"Kopi","assetIds":["x"]}]}'],
    ['missing id', '{"groups":[{"category":"product","title":"Kopi","assetIds":["a"]}]}'],
    [
      'duplicate id',
      '{"groups":[{"category":"product","title":"Kopi","assetIds":["a"]},{"category":"other","title":"Lain","assetIds":["a","b"]}]}',
    ],
  ])('rejects %s', (_name, output) => {
    expect(() => parseCatalog(output, ['a', 'b'])).toThrow()
  })
})

