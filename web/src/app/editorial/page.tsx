import type { Metadata } from 'next'
import Link from 'next/link'
import { getDB } from '@/lib/db'
import ArticleCard from '@/components/article/ArticleCard'
import { absoluteUrl, SITE_NAME } from '@/lib/seo'

const EDITORIAL_DESC =
  'Original editorials, opinion, and analysis from The American Express Times — independent, balanced perspectives on the day’s most important stories.'

export const metadata: Metadata = {
  title: 'Editorial — Opinion & Analysis',
  description: EDITORIAL_DESC,
  alternates: { canonical: absoluteUrl('/editorial') },
  openGraph: {
    type: 'website',
    title: `Editorial — ${SITE_NAME}`,
    description: EDITORIAL_DESC,
    url: absoluteUrl('/editorial'),
    siteName: SITE_NAME,
    images: ['/logo.jpeg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Editorial — ${SITE_NAME}`,
    description: EDITORIAL_DESC,
    images: ['/logo.jpeg'],
  },
}

export const revalidate = 60

const PAGE_SIZE = 12

export default async function EditorialPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam || '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const [articles, total] = await Promise.all([
    getDB().getEditorials(PAGE_SIZE, offset).catch(() => []),
    getDB().getEditorialCount().catch(() => 0),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Opinion &amp; Analysis</p>
        <h1 className="font-serif text-3xl font-bold text-primary border-b-4 border-primary inline-block pb-1">
          Editorial
        </h1>
        <p className="text-gray-500 text-sm mt-3">
          Original opinion and analysis from our editorial team.
        </p>
      </div>

      {articles.length === 0 ? (
        <p className="text-gray-500 text-sm">No editorial articles yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {articles.map(a => <ArticleCard key={a.slug} article={a} variant="grid" />)}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-10 text-sm">
              {page > 1 ? (
                <Link href={`/editorial?page=${page - 1}`}
                  className="px-4 py-2 rounded border border-gray-300 text-primary hover:bg-gray-50 font-semibold">
                  ← Newer
                </Link>
              ) : <span className="px-4 py-2 text-gray-300">← Newer</span>}

              <span className="text-gray-500">Page {page} of {totalPages}</span>

              {page < totalPages ? (
                <Link href={`/editorial?page=${page + 1}`}
                  className="px-4 py-2 rounded border border-gray-300 text-primary hover:bg-gray-50 font-semibold">
                  Older →
                </Link>
              ) : <span className="px-4 py-2 text-gray-300">Older →</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
