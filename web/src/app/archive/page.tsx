import type { Metadata } from 'next'
import { getDB, type Edition } from '@/lib/db'
import ArchiveFilter from '@/components/archive/ArchiveFilter'

export const metadata: Metadata = { title: 'Edition Archive — The American Express Times' }
export const revalidate = 300

export default async function ArchivePage() {
  let editions: Edition[] = []
  try {
    editions = await getDB().getEditionDates(365)
  } catch { /* empty DB */ }

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      {/* Page header */}
      <div className="mb-8 border-b-4 border-double border-primary pb-4">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">The American Express Times</p>
        <h1 className="font-serif text-4xl font-bold text-primary">Edition Archive</h1>
        <p className="text-gray-500 text-sm mt-2">
          Browse every edition — {editions.length} edition{editions.length !== 1 ? 's' : ''} available
        </p>
      </div>

      {editions.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-serif">No editions yet.</p>
          <p className="text-sm mt-2">Upload newspaper PDFs from the admin panel to get started.</p>
        </div>
      ) : (
        <ArchiveFilter editions={editions} />
      )}
    </div>
  )
}
