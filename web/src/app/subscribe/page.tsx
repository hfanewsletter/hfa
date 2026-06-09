import type { Metadata } from 'next'
import Link from 'next/link'
import { getDB } from '@/lib/db'
import { absoluteUrl, SITE_NAME } from '@/lib/seo'
import SubscribeForm from './SubscribeForm'

const TAGLINE =
  "Get the day's biggest stories — balanced, unbiased, and clear — in 5 minutes. Free, every morning."

export const metadata: Metadata = {
  title: 'Subscribe — Free Daily News Digest',
  description: TAGLINE,
  alternates: { canonical: absoluteUrl('/subscribe') },
  openGraph: {
    type: 'website',
    title: `Subscribe to ${SITE_NAME}`,
    description: TAGLINE,
    url: absoluteUrl('/subscribe'),
    siteName: SITE_NAME,
    images: ['/logo.jpeg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Subscribe to ${SITE_NAME}`,
    description: TAGLINE,
    images: ['/logo.jpeg'],
  },
}

export const revalidate = 300

async function getSubscriberCount(): Promise<number> {
  try {
    return await getDB().getSubscriberCount()
  } catch {
    return 0
  }
}

export default async function SubscribePage() {
  const count = await getSubscriberCount()
  // Round down to a friendly number for honest social proof; hide if too small.
  const rounded = Math.floor(count / 100) * 100
  const socialProof =
    rounded >= 500
      ? `Join ${rounded.toLocaleString()}+ readers who start their day with us.`
      : 'Join a growing community of readers who start their day with us.'

  return (
    <div className="bg-[#F0EDE6] min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Top stripe */}
          <div className="h-1.5 bg-accent w-full" />

          <div className="px-7 py-9">
            {/* Masthead (logo links home so it's not a dead-end) */}
            <Link href="/" className="block text-center mb-6">
              <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 font-semibold mb-1">
                The
              </p>
              <h1 className="font-serif text-3xl font-bold leading-none">
                <span className="text-accent">American Express</span>{' '}
                <span className="text-primary text-2xl">Times</span>
              </h1>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 mt-2">
                ★ Balanced · Unbiased · Independent ★
              </p>
            </Link>

            {/* Value proposition */}
            <h2 className="font-serif text-xl font-bold text-primary text-center leading-snug mb-3">
              The day&rsquo;s biggest stories, fairly told — in 5 minutes.
            </h2>
            <p className="text-gray-600 text-[15px] text-center leading-relaxed mb-2">
              {TAGLINE}
            </p>
            <p className="text-sm text-accent font-semibold text-center mb-6">{socialProof}</p>

            {/* The form */}
            <SubscribeForm />
          </div>
        </div>

        {/* What you get — quick reassurance below the card */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <Feature label="Every morning" />
          <Feature label="All sides, no spin" />
          <Feature label="Free forever" />
        </div>
      </div>
    </div>
  )
}

function Feature({ label }: { label: string }) {
  return (
    <div className="text-xs text-gray-500 flex items-center justify-center gap-1.5">
      <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" clipRule="evenodd"
          d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4L8.5 12l6.8-6.7a1 1 0 011.4 0z" />
      </svg>
      {label}
    </div>
  )
}
