import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import EditorialForm from './EditorialForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'New Editorial — Admin' }

export default async function NewEditorialPage() {
  if (!(await isAuthenticated())) {
    redirect('/admin/login')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Admin Panel</p>
          <h1 className="font-serif text-2xl font-bold text-primary">Write an Editorial</h1>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-primary hover:underline">← Back to Admin</Link>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Editorials are published <strong>exactly as written</strong> — never run through the AI
        rewriter — and stay in the <Link href="/editorial" className="text-accent hover:underline">Editorial</Link>{' '}
        section permanently.
      </p>

      <EditorialForm />
    </div>
  )
}
