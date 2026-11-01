import type { MetadataRoute } from 'next'
import { INDEXABLE_PATHS, siteUrl } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  return INDEXABLE_PATHS.map(path => ({
    url: new URL(path, base).toString(),
    changeFrequency: path === '/' ? 'weekly' : 'yearly',
    priority: path === '/' ? 1 : 0.3,
  }))
}
