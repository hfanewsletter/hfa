import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Block Next.js internal RSC fetch URLs (?_rsc=...) — they leak into the
      // crawl as junk duplicates of real pages.
      disallow: ['/admin', '/api/', '/*?_rsc=', '/*&_rsc='],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
