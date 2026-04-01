import Link from 'next/link'
import type { Article } from '@/lib/types'
import ArticleCard from '@/components/article/ArticleCard'

interface SidebarProps {
  latest: Article[]
  categories: string[]
}

export default function Sidebar({ latest, categories }: SidebarProps) {
  return (
    <aside className="space-y-8">

      {/* Latest News */}
      {latest.length > 0 && (
        <div>
          <h3 className="font-serif text-lg font-bold text-primary pb-2 border-b-2 border-primary mb-3 flex items-center gap-2">
            <span className="text-accent">★</span> Latest News
          </h3>
          <div>
            {latest.map(a => <ArticleCard key={a.slug} article={a} variant="list" />)}
          </div>
        </div>
      )}

      {/* Browse by Section */}
      {categories.length > 0 && (
        <div>
          <h3 className="font-serif text-lg font-bold text-primary pb-2 border-b-2 border-primary mb-3">
            Browse Sections
          </h3>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <Link
                key={cat}
                href={`/section/${encodeURIComponent(cat.toLowerCase().replace(/\s+/g, '-'))}`}
                className="text-xs bg-white border border-gray-200 hover:border-accent hover:text-accent
                           text-gray-600 font-semibold px-3 py-1.5 rounded-full transition-colors"
              >
                {cat}
              </Link>
            ))}
          </div>
        </div>
      )}

    </aside>
  )
}
