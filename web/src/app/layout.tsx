import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/layout/Header'
import NavBar from '@/components/layout/NavBar'
import Footer from '@/components/layout/Footer'
import { getDB } from '@/lib/db'
import { isAuthenticated } from '@/lib/auth'

export const metadata: Metadata = {
  title: { default: 'The American Express Times', template: '%s | The American Express Times' },
  description: 'Your trusted source for balanced, unbiased news from across the spectrum.',
  icons: {
    icon: '/logo.jpeg',
    apple: '/logo.jpeg',
  },
}

export const revalidate = 60 // ISR: revalidate pages every 60 seconds

async function getCategories() {
  try {
    return await getDB().getCategories()
  } catch {
    return []
  }
}

async function getHasEditorialsToday() {
  try {
    return await getDB().hasEditorialsToday()
  } catch {
    return false
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [categories, hasEditorialsToday, isAdmin] = await Promise.all([
    getCategories(),
    getHasEditorialsToday(),
    isAuthenticated(),
  ])

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Header />
        <NavBar categories={categories} hasEditorialsToday={hasEditorialsToday} isAdmin={isAdmin} />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
