'use client'

import { useState, FormEvent } from 'react'

export default function EditorialForm() {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [slug, setSlug] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')
    try {
      const res = await fetch('/api/admin/editorial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, summary, body }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Failed to publish.')
        return
      }
      setStatus('success')
      setSlug(data.article?.slug || '')
      setTitle(''); setSummary(''); setBody('')
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div className="bg-white border border-gray-200 rounded p-6">
        <p className="text-green-700 font-semibold mb-2">✓ Editorial published.</p>
        <p className="text-sm text-gray-600 mb-4">
          It&rsquo;s live now and will stay in the{' '}
          <a href="/editorial" className="text-accent hover:underline">Editorial</a> section.
        </p>
        <div className="flex gap-3">
          {slug && (
            <a href={`/article/${slug}`} target="_blank" rel="noopener noreferrer"
              className="text-sm font-semibold text-primary hover:underline">View article →</a>
          )}
          <button onClick={() => setStatus('idle')}
            className="text-sm font-semibold text-accent hover:underline">Write another</button>
        </div>
      </div>
    )
  }

  const labelCls = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1'
  const inputCls =
    'w-full px-3 py-2 rounded border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded p-6 space-y-4">
      <div>
        <label className={labelCls}>Title *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required minLength={5}
          placeholder="Headline of the editorial" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Summary / teaser (optional)</label>
        <input value={summary} onChange={e => setSummary(e.target.value)}
          placeholder="Auto-generated from the body if left blank" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Body *</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} required rows={16}
          placeholder="Write the editorial here. Separate paragraphs with a blank line. To add a byline, end with a line like '— Jane Smith, Editor'. Published exactly as written — no AI rewriting."
          className={`${inputCls} font-serif leading-relaxed resize-y`} />
        <p className="text-xs text-gray-400 mt-1">
          Published <strong>verbatim</strong>. Separate paragraphs with a blank line.
        </p>
      </div>

      {status === 'error' && <p className="text-sm text-red-600">{message}</p>}

      <button type="submit" disabled={status === 'loading'}
        className="bg-accent hover:bg-red-700 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded transition-colors">
        {status === 'loading' ? 'Publishing…' : 'Publish editorial'}
      </button>
    </form>
  )
}
