/**
 * Copyright-safe article header — no borrowed images, no watermark text.
 * Uses a flat solid category colour + subtle diagonal-stripe texture (print feel).
 *
 * Variants
 *   hero    — tall, pull-quote centred with fine rules above/below, badge + date bottom bar
 *   card    — compact, solid colour + texture, badge only
 *   article — slim coloured band at the top of the article page
 */

// Darker, richer flat colours — one per category
const HEADER_BG: Record<string, string> = {
  Politics:             '#1B2D5E',
  Business:             '#065F46',
  Sports:               '#9A3412',
  'US News':            '#7F1D1D',
  'World News':         '#134E4A',
  Opinion:              '#1E293B',
  Health:               '#14532D',
  Technology:           '#1E3A5F',
  Entertainment:        '#4C1D95',
  Crime:                '#450A0A',
  Science:              '#0C4A6E',
  Environment:          '#365314',
  Community:            '#78350F',
  'Business & Markets': '#065F46',
  General:              '#1F2937',
}

function headerBg(category: string): string {
  return HEADER_BG[category] ?? '#1F2937'
}

// Very fine 45-degree diagonal lines — adds depth without looking decorative
const TEXTURE =
  'repeating-linear-gradient(-45deg, transparent 0px, transparent 8px, rgba(255,255,255,0.035) 8px, rgba(255,255,255,0.035) 9px)'

interface Props {
  category: string
  variant?: 'hero' | 'card' | 'article'
  summary?: string
  publishedAt?: string
}

export default function CategoryHeader({
  category,
  variant = 'card',
  summary,
  publishedAt,
}: Props) {
  const isHero    = variant === 'hero'
  const isArticle = variant === 'article'

  // First sentence for the pull-quote
  const pullQuote = summary
    ? (summary.split(/(?<=[.!?])\s/)[0] ?? summary).trim()
    : ''

  const formattedDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null

  /* ── Article variant: slim coloured band, nothing else ── */
  if (isArticle) {
    return (
      <div
        className="w-full h-3"
        style={{ background: headerBg(category) }}
      />
    )
  }

  /* ── Card variant ── */
  if (!isHero) {
    return (
      <div
        className="relative w-full h-36 overflow-hidden"
        style={{
          background: headerBg(category),
          backgroundImage: TEXTURE,
        }}
      >
        {/* Bottom-left badge */}
        <div className="absolute bottom-0 left-0 p-3">
          <span className="section-tag bg-accent text-white text-[10px]">
            {category}
          </span>
        </div>
      </div>
    )
  }

  /* ── Hero variant ── */
  return (
    <div
      className="relative w-full h-72 md:h-96 overflow-hidden"
      style={{
        background: headerBg(category),
        backgroundImage: TEXTURE,
      }}
    >
      {/* Pull-quote block — only if we have content */}
      {pullQuote && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-10 md:px-20">
          {/* Rule above */}
          <div className="w-12 h-px bg-white opacity-40 mb-5" />

          {/* Quote */}
          <p
            className="text-white text-center italic leading-relaxed line-clamp-3"
            style={{ fontSize: 'clamp(0.85rem, 1.5vw, 1.05rem)', opacity: 0.75 }}
          >
            &#8220;{pullQuote}&#8221;
          </p>

          {/* Rule below */}
          <div className="w-12 h-px bg-white opacity-40 mt-5" />
        </div>
      )}

      {/* Bottom bar: badge left, date right */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-6 py-4
                      bg-gradient-to-t from-black/50 to-transparent">
        <span className="bg-accent text-white section-tag">
          {category}
        </span>
        {formattedDate && (
          <span className="text-white/50 text-xs tracking-wide">{formattedDate}</span>
        )}
      </div>
    </div>
  )
}
