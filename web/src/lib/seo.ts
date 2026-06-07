/**
 * Canonical site URL + small SEO helpers.
 *
 * Set NEXT_PUBLIC_SITE_URL in Render (e.g. https://theamericanexpress.us, no
 * trailing slash). Falls back to WEBSITE_BASE_URL (already used elsewhere) and
 * finally the known production domain.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.WEBSITE_BASE_URL ||
  'https://theamericanexpress.us'
).replace(/\/$/, '')

export const SITE_NAME = 'The American Express Times'

/** Build an absolute URL for a site-relative path (e.g. '/article/foo'). */
export function absoluteUrl(path = ''): string {
  if (!path) return SITE_URL
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}
