'use client'
import { useState, useRef } from 'react'

interface UploadResult {
  filename: string
  status: 'queued' | 'error'
  message?: string
}

export default function UploadForm({
  onUploadDone,
  uploadUrl = '/api/admin/upload',
  folder = 'inbox',
  title = 'Upload PDFs',
  description = 'Drop one or more newspaper PDFs. The pipeline will extract, group, and rewrite all articles automatically.',
}: {
  onUploadDone?: () => void
  uploadUrl?: string
  folder?: string
  title?: string
  description?: string
}) {
  const [files, setFiles] = useState<FileList | null>(null)
  const [results, setResults] = useState<UploadResult[]>([])
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isDragging = useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!files || files.length === 0) return

    setUploading(true)
    setResults([])

    const outcomes: UploadResult[] = []

    for (const file of Array.from(files)) {
      try {
        // Try to get a signed upload URL (production: bypasses Netlify 6MB limit)
        const urlRes = await fetch('/api/admin/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, folder }),
        })
        if (urlRes.status === 401) { window.location.href = '/admin/login'; return }

        const urlData = await urlRes.json()

        if (urlData.local) {
          // Local dev: upload via API route as before
          const fd = new FormData()
          fd.append('pdf', file)
          const res = await fetch(uploadUrl, { method: 'POST', body: fd })
          if (res.status === 401) { window.location.href = '/admin/login'; return }
          const data = await res.json()
          outcomes.push({ filename: file.name, status: res.ok ? 'queued' : 'error', message: data.message ?? data.error })
        } else if (urlData.signedUrl) {
          // Production: upload directly to Supabase (no Netlify size limit)
          const putRes = await fetch(urlData.signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/pdf' },
            body: file,
          })
          outcomes.push({
            filename: file.name,
            status: putRes.ok ? 'queued' : 'error',
            message: putRes.ok ? 'Queued for processing' : 'Upload to storage failed',
          })
        } else {
          outcomes.push({ filename: file.name, status: 'error', message: urlData.error ?? 'Failed to get upload URL' })
        }
      } catch {
        outcomes.push({ filename: file.name, status: 'error', message: 'Network error' })
      }
    }

    setResults(outcomes)
    setUploading(false)
    setFiles(null)
    if (inputRef.current) inputRef.current.value = ''

    // Notify parent to refresh PDFList (starts polling)
    if (outcomes.some(r => r.status === 'queued')) {
      onUploadDone?.()
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    isDragging.current = false
    const dropped = e.dataTransfer.files
    if (dropped.length > 0) setFiles(dropped)
  }

  const allQueued = results.length > 0 && results.every(r => r.status === 'queued')

  return (
    <div className="bg-white rounded border border-gray-200 p-6">
      <h2 className="font-serif text-lg font-bold text-primary mb-1">{title}</h2>
      <p className="text-gray-400 text-xs mb-5">{description}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center
                      hover:border-accent transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault() }}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={e => setFiles(e.target.files)}
          />
          {files && files.length > 0 ? (
            <div>
              <p className="text-primary font-semibold text-sm mb-2">
                {files.length} file{files.length > 1 ? 's' : ''} ready to upload
              </p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {Array.from(files).map(f => (
                  <li key={f.name} className="flex items-center justify-center gap-1.5">
                    <span className="text-gray-300">📄</span> {f.name}
                    <span className="text-gray-300">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <p className="text-gray-400 text-sm font-medium">Click to select PDFs</p>
              <p className="text-gray-300 text-xs mt-1">or drag &amp; drop</p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={uploading || !files || files.length === 0}
          className="w-full bg-primary hover:bg-blue-900 text-white font-semibold py-2.5 rounded
                     text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Uploading…
            </>
          ) : 'Upload & Process'}
        </button>
      </form>

      {results.length > 0 && (
        <div className="mt-4">
          {allQueued ? (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded px-3 py-2.5">
              <span className="text-green-500 font-bold">✓</span>
              <span>
                {results.length} PDF{results.length > 1 ? 's' : ''} uploaded successfully.
                The pipeline is now processing — see the progress below.
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map(r => (
                <div key={r.filename}
                  className={`flex items-start gap-2 text-xs px-3 py-2 rounded
                    ${r.status === 'queued' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  <span className="font-bold mt-0.5">{r.status === 'queued' ? '✓' : '✗'}</span>
                  <div>
                    <span className="font-medium">{r.filename}</span>
                    {r.message && <span className="text-gray-400"> — {r.message}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
