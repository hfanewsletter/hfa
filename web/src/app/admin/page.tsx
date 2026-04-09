import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDB } from '@/lib/db'
import { isAuthenticated } from '@/lib/auth'
import AdminRefresh from './AdminRefresh'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminPage() {
  // Double-check auth — guards against middleware edge cases
  if (!(await isAuthenticated())) {
    redirect('/admin/login')
  }
  let articleCount = 0
  let pdfCount = 0
  let subscriberCount = 0
  try {
    ;[articleCount, pdfCount, subscriberCount] = await Promise.all([
      getDB().getTotalArticleCount(),
      getDB().getProcessedPDFCount(),
      getDB().getSubscriberCount(),
    ])
  } catch { /* DB not initialised yet */ }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Admin Panel</p>
          <h1 className="font-serif text-2xl font-bold text-primary">The American Express Times</h1>
        </div>
        <a href="/api/auth/signout"
          className="text-xs text-gray-400 hover:text-gray-700 underline">
          Sign out
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Articles', value: articleCount },
          { label: 'PDFs Processed', value: pdfCount },
          { label: 'Subscribers', value: subscriberCount },
          { label: 'Website', value: <Link href="/" className="text-primary hover:underline text-sm">View →</Link> },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded border border-gray-200 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{stat.label}</p>
            <p className="font-serif text-2xl font-bold text-primary">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Main content — client wrapper handles refresh after upload */}
      <AdminRefresh />
    </div>
  )
}
