import Link from 'next/link'
import type { Article } from '@/lib/types'
import { formatShortDate, truncate } from '@/lib/utils'
import ShareRow from '@/components/article/ShareRow'

interface Props {
  article: Article
  variant?: 'grid' | 'list'
}

export default function ArticleCard({ article, variant = 'grid' }: Props) {
  if (variant === 'list') {
    return (
      <Link href={`/article/${article.slug}`}
        className="flex gap-3 py-3 border-b border-gray-100 group last:border-0">
        <div className="shrink-0 w-0.5 rounded-full bg-accent opacity-60" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2
                         group-hover:text-accent transition-colors">
            {article.title}
          </p>
          <p className="text-xs text-gray-400 mt-1">{formatShortDate(article.published_at)}</p>
        </div>
      </Link>
    )
  }

  // Grid variant — left red border anchors the card, no image area
  // Uses stretched-link pattern so category badge can be a real link
  // without nesting <a> inside <a>.
  return (
    <div
      className="relative group bg-white rounded border border-gray-200 card-hover overflow-hidden"
      style={{ borderLeft: '4px solid #B22234' }}
    >
      <div className="p-4">

        {/* Category badge — links to section page, sits above the stretched article link */}
        <Link
          href={`/section/${encodeURIComponent(article.category.toLowerCase().replace(/\s+/g, '-'))}`}
          className="relative z-10 section-tag bg-accent text-white text-[10px] inline-block mb-3 hover:bg-red-700 transition-colors"
        >
          {article.category}
        </Link>

        {/* Small accent rule */}
        <div className="w-6 h-0.5 bg-accent mb-3 opacity-70" />

        {/* Title — stretched link covers the whole card via ::after */}
        <h3 className="font-serif text-base font-bold text-primary leading-snug mb-2 line-clamp-3
                        group-hover:text-accent transition-colors">
          <Link
            href={`/article/${article.slug}`}
            className="after:absolute after:inset-0"
          >
            {article.title}
          </Link>
        </h3>

        {/* Summary */}
        <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">
          {truncate(article.summary, 25)}
        </p>

        <div className="relative z-10 flex items-center justify-between mt-3">
          <span className="text-xs text-gray-400">{formatShortDate(article.published_at)}</span>
          <ShareRow title={article.title} slug={article.slug} />
        </div>
      </div>
    </div>
  )
}
