import Link from 'next/link'
import type { Article } from '@/lib/types'
import { formatShortDate, truncate } from '@/lib/utils'

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
  return (
    <Link
      href={`/article/${article.slug}`}
      className="block group bg-white rounded border border-gray-200 card-hover overflow-hidden"
      style={{ borderLeft: '4px solid #B22234' }}
    >
      <div className="p-4">

        {/* Category badge */}
        <span className="section-tag bg-accent text-white text-[10px] inline-block mb-3">
          {article.category}
        </span>

        {/* Small accent rule */}
        <div className="w-6 h-0.5 bg-accent mb-3 opacity-70" />

        {/* Title */}
        <h3 className="font-serif text-base font-bold text-primary leading-snug mb-2 line-clamp-3
                        group-hover:text-accent transition-colors">
          {article.title}
        </h3>

        {/* Summary */}
        <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">
          {truncate(article.summary, 25)}
        </p>

        <p className="text-xs text-gray-400 mt-3">{formatShortDate(article.published_at)}</p>
      </div>
    </Link>
  )
}
