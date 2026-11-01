import { describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'

describe('robots and sitemap', () => {
  it('lists only public pages and keeps the app out of search', () => {
    process.env.APP_URL = 'https://carousely.example'
    expect(sitemap().map(entry => entry.url)).toEqual(['https://carousely.example/', 'https://carousely.example/privasi'])
    const { rules, sitemap: map } = robots()
    expect(map).toBe('https://carousely.example/sitemap.xml')
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow
    expect(disallow).toEqual(expect.arrayContaining(['/api/', '/kalender', '/mulai', '/langganan']))
  })
})
