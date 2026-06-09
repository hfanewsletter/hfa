'use client'

import { useState, FormEvent } from 'react'

export default function SubscribeForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Something went wrong. Please try again.')
        return
      }

      setStatus('success')
      setMessage(data.message || "You're in! Check your inbox to confirm.")
      setEmail('')
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  function shareUrl() {
    return typeof window !== 'undefined'
      ? `${window.location.origin}/subscribe`
      : 'https://theamericanexpress.us/subscribe'
  }

  function shareWhatsApp() {
    const text = `Get the day's biggest stories — balanced and unbiased — in 5 minutes. Free daily newsletter: ${shareUrl()}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="font-serif text-2xl font-bold text-primary mb-2">You&rsquo;re in!</h2>
        <p className="text-gray-600 text-[15px] mb-6">{message}</p>

        <div className="border-t border-gray-200 pt-5">
          <p className="text-sm text-gray-500 mb-3">Know someone who&rsquo;d like this? Share it:</p>
          <div className="flex gap-3 justify-center">
            <button onClick={shareWhatsApp}
              className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1da851] text-white
                         text-sm font-semibold px-4 py-2.5 rounded transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-1.7-.9-2.9-1.6-4-3.5-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.5.7.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.2-.5-.3zM12 2a10 10 0 00-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2z" /></svg>
              WhatsApp
            </button>
            <button onClick={copyLink}
              className="inline-flex items-center gap-2 bg-primary hover:bg-blue-900 text-white
                         text-sm font-semibold px-4 py-2.5 rounded transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.1 1.1" />
              </svg>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Honeypot — hidden from real users */}
      <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Enter your email"
        required
        autoFocus
        className="w-full px-4 py-3.5 rounded border border-gray-300 text-[15px] text-gray-900
                   placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-accent hover:bg-red-700 disabled:opacity-60 text-white text-base
                   font-bold py-3.5 rounded transition-colors"
      >
        {status === 'loading' ? 'Subscribing…' : "Subscribe — it's free"}
      </button>
      {status === 'error' && (
        <p className="text-sm text-red-600 text-center">{message}</p>
      )}
      <p className="text-xs text-gray-400 text-center pt-1">
        No spam. Unsubscribe anytime with one click.
      </p>
    </form>
  )
}
