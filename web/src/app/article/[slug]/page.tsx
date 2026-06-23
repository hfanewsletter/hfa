import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getDB } from '@/lib/db'
import { categoryColor, formatDate } from '@/lib/utils'
import { absoluteUrl, SITE_NAME } from '@/lib/seo'
import ShareButtons from '@/components/article/ShareButtons'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = await getDB().getArticleBySlug(slug)
  if (!article) return {}

  const url = absoluteUrl(`/article/${article.slug}`)
  const images = article.image_url ? [article.image_url] : ['/logo.jpeg']

  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.summary,
      url,
      siteName: SITE_NAME,
      publishedTime: article.published_at,
      section: article.category,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.summary,
      images,
    },
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

  // NewsArticle structured data — required for rich results & Google News eligibility
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.summary,
    datePublished: article.published_at,
    dateModified: article.published_at,
    articleSection: article.category,
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(`/article/${article.slug}`) },
    image: [article.image_url || absoluteUrl('/logo.jpeg')],
    author: { '@type': 'Organization', name: SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: absoluteUrl('/logo.jpeg') },
    },
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
              <div className="text-xs text-gray-500">
                <span className="font-semibold text-gray-600">By the Editorial Team</span>
                <span className="text-gray-300"> · </span>
                <span className="text-gray-400">{formatDate(article.published_at)}</span>
              </div>
              <ShareButtons title={article.title} slug={slug} />
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

            {/* Sourcing transparency — accountability signal */}
            <div className="mt-8 pt-5 border-t border-gray-200 text-xs text-gray-500 leading-relaxed">
              This article was reported by synthesizing coverage from multiple independent news
              outlets to present a balanced, unbiased account. Read more about{' '}
              <Link href="/editorial-standards" className="text-accent hover:underline">
                how we report
              </Link>
              . Spotted an error?{' '}
              <a href="mailto:news@theamericanexpress.us" className="text-accent hover:underline">
                Let us know
              </a>
              .
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
