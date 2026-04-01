'use client'

import { useState } from 'react'
import NewsletterForm from './NewsletterForm'

export default function NewsletterModal() {
  const [open, setOpen] = useState(false)
  const [subscribed, setSubscribed] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-block bg-accent hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded transition-colors"
      >
        Join Newsletter
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-primary text-white rounded-lg border-l-4 border-accent p-8 w-full max-w-md mx-4 shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-4 text-blue-300 hover:text-white text-xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>

            {subscribed ? (
              <div className="text-center py-4">
                <p className="text-green-300 font-semibold text-lg mb-2">You&apos;re subscribed!</p>
                <p className="text-blue-200 text-sm">Check your inbox for our next digest.</p>
              </div>
            ) : (
              <>
                <h3 className="font-serif text-2xl font-bold mb-1">Daily Digest</h3>
                <p className="text-blue-200 text-xs uppercase tracking-widest mb-4">The American Express Times</p>
                <p className="text-blue-200 text-sm mb-6 leading-relaxed">
                  Get a curated summary of the day&apos;s top stories delivered to your inbox every morning.
                </p>
                <NewsletterForm onSuccess={() => setSubscribed(true)} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
