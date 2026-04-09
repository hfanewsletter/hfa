import { getDB } from '@/lib/db'
import BreakingBanner from '@/components/home/BreakingBanner'
import HeroStory from '@/components/home/HeroStory'
import StoryGrid from '@/components/home/StoryGrid'
import Sidebar from '@/components/home/Sidebar'
import NewsletterModal from '@/components/newsletter/NewsletterModal'

export const revalidate = 60

export default async function HomePage() {
  let data
  try {
    data = await getDB().getHomepageData()
  } catch (err) {
    console.error('DB error:', err)
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="font-serif text-2xl font-bold text-primary mb-3">No articles yet</h2>
        <p className="text-gray-500 text-sm">
          Drop a newspaper PDF into the <code className="bg-gray-100 px-1 rounded">inbox/</code> folder
          to start processing articles.
        </p>
      </div>
    )
  }

  const { breaking, hero, featured, latest, categories, fallbackDate } = data

  if (!breaking && !hero) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="font-serif text-2xl font-bold text-primary mb-3">No articles for today</h2>
        <p className="text-gray-500 text-sm mb-6">
          Today&apos;s edition hasn&apos;t been processed yet. Check the{' '}
          <a href="/archive" className="underline text-primary">archive</a> for past articles.
        </p>
        <NewsletterModal />
      </div>
    )
  }

  return (
    <>
      {breaking && <BreakingBanner article={breaking} />}

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main column */}
          <div className="lg:col-span-2 space-y-10">
            {hero && <HeroStory article={hero} />}
            {featured.length > 0 && <StoryGrid articles={featured} />}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Sidebar latest={latest} categories={categories} />
          </div>

        </div>
      </div>
    </>
  )
}
