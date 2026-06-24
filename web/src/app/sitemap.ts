import type { MetadataRoute } from 'next'
import { getDB } from '@/lib/db'
import { absoluteUrl } from '@/lib/seo'

export const revalidate = 3600 // rebuild sitemap hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDB()

  const [articles, categories] = await Promise.all([
    db.getLatestArticles(2000).catch(() => []),
    db.getCategories().catch(() => []),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'hourly', priority: 1 },
    { url: absoluteUrl('/subscribe'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/archive'), changeFrequency: 'daily', priority: 0.6 },
    { url: absoluteUrl('/newsletter'), changeFrequency: 'daily', priority: 0.5 },
    { url: absoluteUrl('/editorial'), changeFrequency: 'daily', priority: 0.5 },
    { url: absoluteUrl('/about'), changeFrequency: 'monthly', priority: 0.4 },
    { url: absoluteUrl('/editorial-standards'), changeFrequency: 'monthly', priority: 0.4 },
    { url: absoluteUrl('/terms'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/privacy'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/contact'), changeFrequency: 'yearly', priority: 0.3 },
  ]

  const sectionRoutes: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: absoluteUrl(`/section/${encodeURIComponent(cat.toLowerCase())}`),
    changeFrequency: 'daily',
    priority: 0.6,
  }))

  // Archive date pages are intentionally NOT in the sitemap — they're noindexed
  // thin listing pages (still reachable/crawlable via the /archive index).

  const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
    url: absoluteUrl(`/article/${a.slug}`),
    lastModified: a.published_at ? new Date(a.published_at) : undefined,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  return [...staticRoutes, ...sectionRoutes, ...articleRoutes]
}
