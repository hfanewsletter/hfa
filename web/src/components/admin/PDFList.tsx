'use client'
import { useEffect, useRef, useState } from 'react'
import type { PDFRecord } from '@/lib/types'
import { formatShortDate } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100   text-blue-700',
  processed:  'bg-green-100  text-green-700',
  failed:     'bg-red-100    text-red-600',
}

// Visual stages shown while a PDF is being worked on
const PROCESSING_STAGES = [
  'Extracting articles…',
  'Grouping same stories…',
  'Rewriting content…',
  'Saving to database…',
  'Finalising…',
]

function ProcessingBar({ filename }: { filename: string }) {
  const [stage, setStage] = useState(0)
  const [width, setWidth] = useState(8)

  useEffect(() => {
    // Cycle through stages every ~4 seconds
    const interval = setInterval(() => {
      setStage(s => (s + 1) % PROCESSING_STAGES.length)
      setWidth(w => Math.min(w + Math.floor(Math.random() * 12 + 6), 90))
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span className="font-medium truncate max-w-[70%]">{filename}</span>
        <span className="text-blue-600 font-medium">{PROCESSING_STAGES[stage]}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-1.5 rounded-full bg-blue-500 transition-all duration-1000"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

const PAGE_SIZE = 5

export default function PDFList({ refreshTrigger }: { refreshTrigger?: number }) {
  const [pdfs, setPdfs] = useState<PDFRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function fetchPdfs(showLoading = false) {
    if (showLoading) setLoading(true)
    fetch('/api/admin/pdfs')
      .then(r => r.json())
      .then(data => {
        const list: PDFRecord[] = data.pdfs ?? []
        setPdfs(list)
        setLoading(false)

        // If any PDF is still active, keep polling
        const hasActive = list.some(p => p.status === 'pending' || p.status === 'processing')
        if (hasActive && !pollRef.current) {
          pollRef.current = setInterval(() => fetchPdfs(), 3000)
        } else if (!hasActive && pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      })
      .catch(() => setLoading(false))
  }

  // Fetch on mount and whenever the refresh trigger fires
  useEffect(() => {
    fetchPdfs(true)
    setPage(1)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger])

  // Deduplicate: pipeline may insert a second record when it starts.
  // Keep the latest record per filename (highest uploaded_at).
  const deduped = Object.values(
    pdfs.reduce<Record<string, PDFRecord>>((acc, p) => {
      const prev = acc[p.filename]
      if (!prev || new Date(p.uploaded_at) > new Date(prev.uploaded_at)) acc[p.filename] = p
      return acc
    }, {})
  ).sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())

  const activePdfs = deduped.filter(p => p.status === 'pending' || p.status === 'processing')

  const totalPages = Math.max(1, Math.ceil(deduped.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = deduped.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="space-y-4">

      {/* Active processing banner */}
      {activePdfs.length > 0 && (
        <div className="bg-white rounded border border-blue-200 px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            {/* Spinning indicator */}
            <svg className="animate-spin h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm font-semibold text-blue-700">
              Processing {activePdfs.length} PDF{activePdfs.length > 1 ? 's' : ''}
            </span>
            <span className="text-xs text-gray-400 ml-auto">Polling every 3s</span>
          </div>

          <div className="space-y-3">
            {activePdfs.map(pdf => (
              <ProcessingBar key={pdf.id ?? pdf.filename} filename={pdf.filename} />
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-3">
            The Python worker is running in the background. This page updates automatically.
          </p>
        </div>
      )}

      {/* PDF table */}
      <div className="bg-white rounded border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold text-primary">Processed PDFs</h2>
          <span className="text-xs text-gray-400">{deduped.length} total</span>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 px-5 py-8 text-center">Loading…</p>
        ) : deduped.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-8 text-center">No PDFs uploaded yet.</p>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {paginated.map(pdf => (
                <div key={pdf.id ?? pdf.filename} className="px-5 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{pdf.filename}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Uploaded {formatShortDate(pdf.uploaded_at)}
                      {pdf.processed_at && ` · Processed ${formatShortDate(pdf.processed_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {pdf.article_count > 0 && (
                      <span className="text-xs text-gray-500 font-medium">
                        {pdf.article_count} article{pdf.article_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize
                      ${STATUS_STYLES[pdf.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {pdf.status === 'processing' ? (
                        <span className="flex items-center gap-1">
                          <svg className="animate-spin h-2.5 w-2.5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          processing
                        </span>
                      ) : pdf.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  Page {currentPage} of {totalPages}
                  <span className="ml-2 text-gray-300">·</span>
                  <span className="ml-2">
                    {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, deduped.length)} of {deduped.length}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 text-xs font-medium rounded border border-gray-200
                               text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed
                               transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 text-xs font-medium rounded border border-gray-200
                               text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed
                               transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
