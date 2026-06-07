/**
 * Canonical site URL + small SEO helpers.
 *
 * Always the public production domain so sitemap/canonical/OG URLs are correct.
 * We deliberately do NOT fall back to WEBSITE_BASE_URL: on Render that var is the
 * internal *.onrender.com URL, which must never appear in sitemaps or canonical
 * tags (it caused "URL not allowed" in Search Console). Override only via an
 * explicit NEXT_PUBLIC_SITE_URL if the domain ever changes.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://theamericanexpress.us'
).replace(/\/$/, '')

export const SITE_NAME = 'The American Express Times'

/** Build an absolute URL for a site-relative path (e.g. '/article/foo'). */
export function absoluteUrl(path = ''): string {
  if (!path) return SITE_URL
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}
