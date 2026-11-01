import type { MetadataRoute } from 'next'
import { PRIVATE_PATHS, siteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...PRIVATE_PATHS] }],
    sitemap: new URL('/sitemap.xml', base).toString(),
    host: base.origin,
  }
}
