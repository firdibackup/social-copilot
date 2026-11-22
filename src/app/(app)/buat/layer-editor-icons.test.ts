import { describe, expect, it } from 'vitest'
import { searchItems } from '@/lib/element-search'
import { ELEMENT_ICONS, ICON_CATEGORIES, iconText } from './layer-editor-icons'

describe('element icons', () => {
  it('lists each icon once, with a component, a label and a known category', () => {
    expect(new Set(ELEMENT_ICONS.map((item) => item.id)).size).toBe(ELEMENT_ICONS.length)
    for (const item of ELEMENT_ICONS) {
      expect(item.Icon, item.id).toBeTruthy()
      expect(item.label.trim(), item.id).not.toBe('')
      expect(ICON_CATEGORIES).toContain(item.category)
    }
    for (const category of ICON_CATEGORIES) expect(ELEMENT_ICONS.some((item) => item.category === category), category).toBe(true)
  })

  it('finds icons by Indonesian or English words', () => {
    const ids = (query: string) => searchItems(ELEMENT_ICONS, iconText, query).map((item) => item.id)
    expect(ids('kopi')).toEqual(['Coffee'])
    expect(ids('arrow right')).toContain('ArrowRight')
    expect(ids('rumah')).toEqual(expect.arrayContaining(['Home', 'Hospital']))
    expect(ids('zzz')).toEqual([])
  })
})
