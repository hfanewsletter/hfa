import Link from 'next/link'
import type { Article } from '@/lib/types'
import { formatShortDate, truncate } from '@/lib/utils'

export default function HeroStory({ article }: { article: Article }) {
  return (
    <Link href={`/article/${article.slug}`} className="block group">
      <div className="bg-white rounded border border-gray-200 border-t-4 border-t-accent card-hover overflow-hidden">
        <div className="p-6 md:p-8">

          {/* Category badge */}
          <span className="bg-accent text-white section-tag inline-block mb-4">
            {article.category}
          </span>

          {/* Red accent rule */}
          <div className="w-10 h-0.5 bg-accent mb-4" />

          {/* Headline — large, this is the visual hero now */}
          <h2
            className="font-serif font-bold text-primary leading-tight mb-4 group-hover:text-accent transition-colors"
            style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.6rem)' }}
          >
            {article.title}
          </h2>

          {/* Summary — show more text than grid cards */}
          <p className="text-gray-600 text-base leading-relaxed mb-6">
            {truncate(article.summary, 55)}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-xs text-gray-400">
            <span>{formatShortDate(article.published_at)}</span>
            <span className="font-semibold text-accent group-hover:underline underline-offset-2 transition-colors">
              Read full story →
            </span>
          </div>

        </div>
      </div>
    </Link>
  )
}
