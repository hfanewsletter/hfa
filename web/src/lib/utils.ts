export const CATEGORY_COLORS: Record<string, string> = {
  Politics:             'bg-[#1B2D5E] text-white',
  Business:             'bg-emerald-700 text-white',
  Sports:               'bg-orange-600 text-white',
  'US News':            'bg-[#B22234] text-white',
  'World News':         'bg-teal-700 text-white',
  Opinion:              'bg-slate-600 text-white',
  Health:               'bg-green-700 text-white',
  Technology:           'bg-blue-600 text-white',
  Entertainment:        'bg-purple-600 text-white',
  Crime:                'bg-red-800 text-white',
  Science:              'bg-sky-600 text-white',
  Environment:          'bg-lime-700 text-white',
  Community:            'bg-amber-600 text-white',
  'Business & Markets': 'bg-emerald-700 text-white',
  General:              'bg-gray-500 text-white',
}

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? 'bg-[#1B2D5E] text-white'
}

export const CATEGORY_GRADIENTS: Record<string, string> = {
  Politics:             'from-[#1B2D5E] to-blue-600',
  Business:             'from-emerald-800 to-emerald-600',
  Sports:               'from-orange-700 to-orange-500',
  'US News':            'from-[#B22234] to-red-500',
  'World News':         'from-teal-800 to-teal-600',
  Opinion:              'from-slate-700 to-slate-500',
  Health:               'from-green-800 to-green-600',
  Technology:           'from-blue-800 to-blue-500',
  Entertainment:        'from-purple-800 to-purple-600',
  Crime:                'from-red-900 to-red-700',
  Science:              'from-sky-800 to-sky-600',
  Environment:          'from-lime-800 to-lime-600',
  General:              'from-gray-700 to-gray-500',
}

export function categoryGradient(category: string): string {
  return CATEGORY_GRADIENTS[category] ?? 'from-gray-700 to-gray-500'
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Returns the current date in America/New_York as 'YYYY-MM-DD'.
 * Use this instead of new Date().toISOString().slice(0,10) which returns UTC
 * and causes articles to archive 5 hours early for EST users.
 * offsetDays=1 returns tomorrow's date in EST, etc.
 */
/** Advance a 'YYYY-MM-DD' string by N days (pure date arithmetic, no TZ issues). */
export function advanceDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const shifted = new Date(y, m - 1, d + days)
  return [
    shifted.getFullYear(),
    String(shifted.getMonth() + 1).padStart(2, '0'),
    String(shifted.getDate()).padStart(2, '0'),
  ].join('-')
}

export function getDateEST(offsetDays = 0): string {
  const base = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  if (offsetDays === 0) return base
  const [y, m, d] = base.split('-').map(Number)
  const shifted = new Date(y, m - 1, d + offsetDays)
  return [
    shifted.getFullYear(),
    String(shifted.getMonth() + 1).padStart(2, '0'),
    String(shifted.getDate()).padStart(2, '0'),
  ].join('-')
}

export function truncate(text: string, maxWords: number): string {
  const words = text.split(' ')
  if (words.length <= maxWords) return text
  return words.slice(0, maxWords).join(' ') + '…'
}

/**
 * URL-safe slug matching the Python pipeline's generate_slug():
 * lowercase, strip punctuation, spaces→hyphens, cap title at 55 chars,
 * then append the date as `-YYYY-MM-DD`.
 */
// Deterministic term normalizations — mirrors config.yaml content_filters.replacements
// (Python pipeline). Applied to admin-typed editorials so loaded phrasing never ships.
// Longest phrase first so "the zionist entity" wins over "zionist entity".
const TERM_REPLACEMENTS: [RegExp, string][] = [
  [/\bthe zionist entity\b/gi, 'Israel'],
  [/\bthe zionist regime\b/gi, 'Israel'],
  [/\bzionist entity\b/gi, 'Israel'],
  [/\bzionist regime\b/gi, 'Israel'],
  [/\bzionist state\b/gi, 'Israel'],
]

export function normalizeTerms(text: string): string {
  if (!text) return text
  let out = text
  for (const [re, repl] of TERM_REPLACEMENTS) out = out.replace(re, repl)
  return out
}

export function slugify(title: string, dateStr: string): string {
  const base = title
    .toLowerCase()
    // Transliterate accented/non-ASCII letters to ASCII (ü→u, é→e) so URLs never
    // contain raw multibyte chars that 404 on Unicode-normalization mismatch.
    // NFKD splits 'ü' into 'u' + combining mark; the a-z0-9 filter then drops the mark.
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 55)
    .replace(/-+$/g, '')
  return `${base}-${dateStr}`
}
