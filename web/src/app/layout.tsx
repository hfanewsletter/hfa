import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import Header from '@/components/layout/Header'
import NavBar from '@/components/layout/NavBar'
import Footer from '@/components/layout/Footer'
import { getDB } from '@/lib/db'
import { SITE_URL, SITE_NAME } from '@/lib/seo'

const GA_ID = process.env.NEXT_PUBLIC_GA_ID

const DESCRIPTION =
  'Your trusted source for balanced, unbiased news from across the spectrum.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  icons: {
    icon: '/logo.jpeg',
    apple: '/logo.jpeg',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    url: SITE_URL,
    images: ['/logo.jpeg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: DESCRIPTION,
    images: ['/logo.jpeg'],
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
  const [categories, hasEditorialsToday] = await Promise.all([
    getCategories(),
    getHasEditorialsToday(),
  ])

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Header />
        <NavBar categories={categories} hasEditorialsToday={hasEditorialsToday} />
        <main className="flex-1">{children}</main>
        <Footer />
        {/* Google Analytics 4 — only loads when NEXT_PUBLIC_GA_ID is set in env */}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
