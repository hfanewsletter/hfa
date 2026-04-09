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

const STALE_MINUTES = 20
const FAST_POLL_MS  = 5_000   // while actively processing
const SLOW_POLL_MS  = 30_000  // after stalling — keep checking until resolved

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

/** Live elapsed-time counter. Resets when `startedAt` changes. */
function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(Date.now() - new Date(startedAt).getTime())
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - new Date(startedAt).getTime()), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return <>{formatDuration(elapsed)}</>
}

function ActiveRow({ pdf, onReset }: { pdf: PDFRecord; onReset: () => void }) {
  const isStale = (Date.now() - new Date(pdf.uploaded_at).getTime()) > STALE_MINUTES * 60 * 1000
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    setResetting(true)
    await fetch('/api/admin/pdfs/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: [pdf.filename] }),
    })
    setResetting(false)
    onReset()
  }

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 min-w-0">
        {isStale ? (
          <span className="shrink-0 w-2 h-2 rounded-full bg-yellow-400" />
        ) : (
          <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        )}
        <span className="text-sm text-gray-700 truncate">{pdf.filename}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <span className="text-xs text-gray-400 tabular-nums">
          <ElapsedTimer startedAt={pdf.uploaded_at} />
        </span>
        <button
          onClick={handleReset}
          disabled={resetting}
          title="Mark as failed and remove from this list"
          className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40 text-sm leading-none"
        >
          {resetting ? '…' : '✕'}
        </button>
      </div>
    </div>
  )
}

const PAGE_SIZE = 5

export default function PDFList({ refreshTrigger }: { refreshTrigger?: number }) {
  const [pdfs, setPdfs]       = useState<PDFRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [dismissing, setDismissing] = useState(false)
  const fastPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const slowPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function clearPolls() {
    if (fastPollRef.current) { clearInterval(fastPollRef.current); fastPollRef.current = null }
    if (slowPollRef.current) { clearInterval(slowPollRef.current); slowPollRef.current = null }
  }

  function fetchPdfs(showLoading = false) {
    if (showLoading) setLoading(true)
    fetch('/api/admin/pdfs')
      .then(r => r.json())
      .then(data => {
        const list: PDFRecord[] = data.pdfs ?? []
        setPdfs(list)
        setLoading(false)

        const active = list.filter(p => p.status === 'pending' || p.status === 'processing')
        const hasActive = active.length > 0
        const allStale  = hasActive && active.every(
          p => (Date.now() - new Date(p.uploaded_at).getTime()) > STALE_MINUTES * 60 * 1000
        )

        clearPolls()
        if (!hasActive) {
          // Nothing in flight — no polling needed
        } else if (allStale) {
          // Stalled: keep a slow poll so we catch eventual completion
          slowPollRef.current = setInterval(() => fetchPdfs(), SLOW_POLL_MS)
        } else {
          // Active: fast poll
          fastPollRef.current = setInterval(() => fetchPdfs(), FAST_POLL_MS)
        }
      })
      .catch(() => setLoading(false))
  }

  async function handleDismiss() {
    setDismissing(true)
    const filenames = activePdfs.map(p => p.filename)
    await fetch('/api/admin/pdfs/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames }),
    })
    clearPolls()
    setDismissing(false)
    fetchPdfs()
  }

  useEffect(() => {
    fetchPdfs(true)
    setPage(1)
    return clearPolls
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger])

  // Deduplicate: keep the latest record per filename
  const deduped = Object.values(
    pdfs.reduce<Record<string, PDFRecord>>((acc, p) => {
      const prev = acc[p.filename]
      if (!prev || new Date(p.uploaded_at) > new Date(prev.uploaded_at)) acc[p.filename] = p
      return acc
    }, {})
  ).sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())

  const activePdfs = deduped.filter(p => p.status === 'pending' || p.status === 'processing')
  const hasStale   = activePdfs.some(
    p => (Date.now() - new Date(p.uploaded_at).getTime()) > STALE_MINUTES * 60 * 1000
  )

  const totalPages  = Math.max(1, Math.ceil(deduped.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated   = deduped.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="space-y-4">

      {/* Active processing panel */}
      {activePdfs.length > 0 && (
        <div className={`bg-white rounded border px-5 py-4 ${hasStale ? 'border-yellow-300' : 'border-blue-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {hasStale ? (
                <span className="text-yellow-500 text-sm">⚠</span>
              ) : (
                <svg className="animate-spin h-3.5 w-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              <span className={`text-sm font-semibold ${hasStale ? 'text-yellow-700' : 'text-blue-700'}`}>
                {hasStale
                  ? `${activePdfs.length} PDF${activePdfs.length > 1 ? 's' : ''} still processing`
                  : `Processing ${activePdfs.length} PDF${activePdfs.length > 1 ? 's' : ''}…`}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">Elapsed</span>
              <button
                onClick={handleDismiss}
                disabled={dismissing}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                title="Mark all stuck PDFs as failed"
              >
                {dismissing ? 'Clearing…' : 'Clear All ✕'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {activePdfs.map(pdf => (
              <ActiveRow key={pdf.id ?? pdf.filename} pdf={pdf} onReset={fetchPdfs} />
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-3">
            {hasStale
              ? 'These appear to be stuck — the pipeline may have restarted. Use ✕ to clear individual items or "Clear All ✕" to reset all.'
              : 'Updating automatically every 5 seconds.'}
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
              {paginated.map(pdf => {
                // Compute processing duration for display
                let durationLabel: string | null = null
                if (pdf.status === 'processed' && pdf.processed_at && pdf.uploaded_at) {
                  const ms = new Date(pdf.processed_at).getTime() - new Date(pdf.uploaded_at).getTime()
                  if (ms > 0) durationLabel = formatDuration(ms)
                }

                return (
                  <div key={pdf.id ?? pdf.filename} className="px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{pdf.filename}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Uploaded {formatShortDate(pdf.uploaded_at)}
                        {durationLabel && (
                          <> · <span className="text-gray-500">Processed in {durationLabel}</span></>
                        )}
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
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                            processing
                          </span>
                        ) : pdf.status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
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
