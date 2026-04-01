import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getDB } from '@/lib/db'
import { categoryColor, formatDate } from '@/lib/utils'
import ShareButtons from '@/components/article/ShareButtons'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = await getDB().getArticleBySlug(slug)
  if (!article) return {}
  return {
    title: article.title,
    description: article.summary,
  }
}

export const revalidate = 60

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const article = await getDB().getArticleBySlug(slug)
  if (!article) notFound()

  // Split content into paragraphs
  const paragraphs = article.rewritten_content
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Article */}
        <article className="lg:col-span-2">
          {/* Category + breadcrumb */}
          <div className="flex items-center gap-2 mb-4 text-sm">
            <Link href="/" className="text-gray-400 hover:text-primary">Home</Link>
            <span className="text-gray-300">/</span>
            <Link
              href={`/section/${encodeURIComponent(article.category.toLowerCase().replace(/\s+/g, '-'))}`}
              className="text-gray-400 hover:text-primary"
            >
              {article.category}
            </Link>
          </div>

          <div className="bg-white border border-gray-200 border-t-4 border-t-accent rounded p-6 md:p-8">
            <span className={`section-tag ${categoryColor(article.category)} mb-4 inline-block`}>
              {article.category}
            </span>

            <h1 className="font-serif text-2xl md:text-4xl font-bold text-primary leading-tight mb-4">
              {article.title}
            </h1>

            <div className="flex items-center justify-between pb-5 mb-6 border-b border-gray-200">
              <span className="text-xs text-gray-400">{formatDate(article.published_at)}</span>
              <ShareButtons
                title={article.title}
                url={`${process.env.WEBSITE_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/article/${slug}`}
              />
            </div>

            {/* Summary callout */}
            <blockquote className="border-l-4 border-accent pl-4 mb-6 italic text-gray-600 leading-relaxed">
              {article.summary}
            </blockquote>

            {/* Full article body */}
            <div className="article-body">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </article>

        {/* Related / back nav */}
        <aside className="lg:col-span-1">
          <div className="bg-white rounded border border-gray-200 p-5">
            <h3 className="font-serif font-bold text-primary mb-4 pb-2 border-b border-gray-100">
              About this article
            </h3>
            <dl className="text-sm space-y-3 text-gray-600">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-0.5">Published</dt>
                <dd>{formatDate(article.published_at)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-0.5">Section</dt>
                <dd>
                  <Link
                    href={`/section/${encodeURIComponent(article.category.toLowerCase().replace(/\s+/g, '-'))}`}
                    className="text-primary hover:underline"
                  >
                    {article.category}
                  </Link>
                </dd>
              </div>
            </dl>

            <div className="mt-5 pt-4 border-t border-gray-100">
              <Link href="/" className="text-sm text-primary hover:underline font-semibold">
                ← Back to Home
              </Link>
            </div>
          </div>
        </aside>

      </div>
    </div>
  )
}
