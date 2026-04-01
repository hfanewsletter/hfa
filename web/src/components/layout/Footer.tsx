import Link from 'next/link'
import NewsletterModal from '@/components/newsletter/NewsletterModal'

export default function Footer() {
  return (
    <footer className="bg-primary text-white mt-12">
      {/* Thin red stripe at top of footer */}
      <div className="h-1 bg-accent w-full" />

      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">

          <div>
            <h3 className="font-serif text-xl font-bold mb-1">
              <span className="text-accent">The American Express</span> Times
            </h3>
            <p className="text-xs text-blue-200 uppercase tracking-widest mb-3">★ Est. 2026</p>
            <p className="text-blue-200 text-sm leading-relaxed">
              Delivering balanced, unbiased news synthesized from multiple sources.
              Every story presents all sides of the aisle.
            </p>
          </div>

          <div>
            <h4 className="font-semibold uppercase tracking-wider text-xs text-blue-300 mb-3">Navigate</h4>
            <ul className="space-y-1.5 text-sm">
              {['Home', 'Newsletter'].map(l => (
                <li key={l}>
                  <Link href={l === 'Home' ? '/' : `/${l.toLowerCase()}`}
                    className="text-blue-200 hover:text-white transition-colors">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold uppercase tracking-wider text-xs text-blue-300 mb-3">Subscribe</h4>
            <p className="text-blue-200 text-sm mb-3">Get the daily digest in your inbox.</p>
            <NewsletterModal />
          </div>

        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-blue-300">
          <p>© {new Date().getFullYear()} The American Express Times. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/newsletter" className="hover:text-white transition-colors">Newsletter Archive</Link>
            <Link href="/admin" className="hover:text-white transition-colors">Admin</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
