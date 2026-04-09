'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import NewsletterModal from '@/components/newsletter/NewsletterModal'

interface NavBarProps {
  categories: string[]
  hasEditorialsToday?: boolean
}

// Editorial priority order: hard news → national/local → lifestyle → opinion → catch-all
const CATEGORY_ORDER: Record<string, number> = {
  'Politics':      1,
  'Crime':         2,
  'Business':      3,
  'International': 4,
  'Local':         5,
  'Health':        6,
  'Science':       7,
  'Technology':    8,
  'Environment':   9,
  'Entertainment': 10,
  'Opinion':       11,
  'Sports':        12,
  'General':       13,
}

function sortCategories(cats: string[]): string[] {
  return [...cats].sort((a, b) => {
    const pa = CATEGORY_ORDER[a] ?? 99
    const pb = CATEGORY_ORDER[b] ?? 99
    return pa !== pb ? pa - pb : a.localeCompare(b)
  })
}


export default function NavBar({ categories, hasEditorialsToday = false }: NavBarProps) {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/admin/me')
      .then(r => r.json())
      .then(d => setIsAdmin(d.isAdmin === true))
      .catch(() => {})
  }, [])

  function categoryHref(cat: string) {
    return `/section/${encodeURIComponent(cat.toLowerCase().replace(/\s+/g, '-'))}`
  }

  function isCategoryActive(cat: string) {
    return pathname.includes(cat.toLowerCase().replace(/\s+/g, '-'))
  }

  return (
    <nav className="sticky top-0 z-40 shadow-md">

      {/* ── Row 1: Primary links ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 flex items-center">
          {/* Home */}
          <Link
            href="/"
            className={`whitespace-nowrap px-4 py-3 text-sm font-bold transition-colors border-b-2
              ${pathname === '/' ? 'text-accent border-accent' : 'text-gray-700 border-transparent hover:text-accent hover:border-accent'}`}
          >
            Home
          </Link>

          {/* Editorial — visible only when there are editorials today */}
          {hasEditorialsToday && (
            <Link
              href="/editorial"
              className={`whitespace-nowrap px-4 py-3 text-sm font-bold transition-colors border-b-2
                ${pathname === '/editorial' ? 'text-accent border-accent' : 'text-gray-700 border-transparent hover:text-accent hover:border-accent'}`}
            >
              Editorial
            </Link>
          )}

          {/* Email Digests — admin only */}
          {isAdmin && (
            <Link
              href="/newsletter"
              className={`whitespace-nowrap px-4 py-3 text-sm font-bold transition-colors border-b-2
                ${pathname.startsWith('/newsletter') ? 'text-accent border-accent' : 'text-gray-700 border-transparent hover:text-accent hover:border-accent'}`}
            >
              Email Digests
            </Link>
          )}

          {/* Archive */}
          <Link
            href="/archive"
            className={`whitespace-nowrap px-4 py-3 text-sm font-bold transition-colors border-b-2
              ${pathname.startsWith('/archive') ? 'text-accent border-accent' : 'text-gray-700 border-transparent hover:text-accent hover:border-accent'}`}
          >
            Archive
          </Link>

          {/* Spacer pushes Join Newsletter to the right */}
          <div className="flex-1" />

          {/* Join Newsletter */}
          <div className="py-1.5">
            <NewsletterModal />
          </div>
        </div>
      </div>

      {/* ── Row 2: Category sections ── */}
      <div className="bg-primary">
        <div className="max-w-7xl mx-auto px-4">
          {/* Scrollable on narrow screens, wraps naturally on wide screens */}
          <div className="flex items-center overflow-x-auto scrollbar-hide">
            <span className="text-white/40 text-[10px] uppercase tracking-widest font-bold
                             pr-3 mr-1 border-r border-white/20 shrink-0 py-2.5">
              Sections
            </span>
            {sortCategories(categories).map(cat => {
              const active = isCategoryActive(cat)
              return (
                <Link
                  key={cat}
                  href={categoryHref(cat)}
                  className={`
                    whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold tracking-wide
                    transition-colors border-b-2 shrink-0
                    ${active
                      ? 'text-white border-accent'
                      : 'text-white/70 border-transparent hover:text-white hover:border-white/50'}
                  `}
                >
                  {cat}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

    </nav>
  )
}
