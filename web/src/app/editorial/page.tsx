import type { Metadata } from 'next'
import { getDB } from '@/lib/db'
import ArticleCard from '@/components/article/ArticleCard'

export const metadata: Metadata = { title: 'Editorial' }

export const revalidate = 60

export default async function EditorialPage() {
  const articles = await getDB().getEditorialArticles()

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Opinion &amp; Analysis</p>
        <h1 className="font-serif text-3xl font-bold text-primary border-b-4 border-primary inline-block pb-1">
          Editorial
        </h1>
      </div>

      {articles.length === 0 ? (
        <p className="text-gray-500 text-sm">No editorial articles available.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map(a => <ArticleCard key={a.slug} article={a} variant="grid" />)}
        </div>
      )}
    </div>
  )
}
