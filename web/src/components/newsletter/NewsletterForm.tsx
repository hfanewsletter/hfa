'use client'

import { useState, FormEvent } from 'react'

export default function NewsletterForm({ onSuccess }: { onSuccess?: () => void }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

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
        setMessage(data.error || 'Something went wrong.')
        return
      }

      setStatus('success')
      setMessage(data.message || 'You have been subscribed!')
      setEmail('')
      onSuccess?.()
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  if (status === 'success') {
    return <p className="text-sm text-green-300 font-semibold">{message}</p>
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
        className="w-full px-4 py-3 rounded text-sm text-gray-900 placeholder-gray-400
                   focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-accent hover:bg-red-700 disabled:opacity-60 text-white text-base
                   font-bold py-3 rounded transition-colors"
      >
        {status === 'loading' ? 'Subscribing...' : 'Join Newsletter'}
      </button>
      {status === 'error' && (
        <p className="text-xs text-red-300">{message}</p>
      )}
    </form>
  )
}
