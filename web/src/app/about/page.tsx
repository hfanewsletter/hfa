import type { Metadata } from 'next'
import NewsletterModal from '@/components/newsletter/NewsletterModal'

export const metadata: Metadata = {
  title: 'About',
  description:
    'The American Express Times delivers balanced, unbiased news synthesized from multiple trusted sources — every story presents all sides.',
}

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8 border-b-4 border-double border-primary pb-5">
        <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">
          The American Express Times
        </p>
        <h1 className="font-serif text-4xl font-bold text-primary">About Us</h1>
        <p className="text-gray-500 text-sm mt-2">Balanced &middot; Unbiased &middot; Independent</p>
      </div>

      <div className="space-y-6 text-gray-700 leading-relaxed text-[15px]">
        <p>
          <strong>The American Express Times</strong> is an independent news publication with a
          single mission: to give readers a clear, balanced understanding of the day&rsquo;s most
          important stories — free from the spin and partisanship that dominate modern media.
        </p>

        <section>
          <h2 className="font-serif text-2xl font-bold text-primary mb-2">What We Do</h2>
          <p>
            Every day, we review coverage of major stories across a wide range of trusted newspapers
            and news outlets — domestic and international, across the political spectrum. For each
            story, our editorial process synthesizes those multiple perspectives into a single,
            original, unbiased article of around 300&ndash;500 words. The result is a briefing that
            tells you <em>what happened</em> and <em>how it&rsquo;s being reported from all sides</em>,
            without telling you what to think.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-primary mb-2">Our Editorial Approach</h2>
          <p>
            We do not simply republish or copy articles. Each piece on this site is an original
            synthesis written specifically for our readers, drawing on and fairly representing
            multiple independent sources for the same event. Where outlets disagree, we present the
            disagreement plainly. Our goal is balance: if a reader on the left and a reader on the
            right both read the same story, each should feel it was reported fairly.
          </p>
          <p className="mt-3">
            We use modern technology to help us monitor and process a large volume of sources
            quickly, but every published article is built around the principle of multi-source,
            balanced reporting.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-primary mb-2">The Daily Digest</h2>
          <p>
            Beyond the website, we deliver a free daily email digest summarizing the day&rsquo;s top
            stories. It&rsquo;s the fastest way to stay genuinely informed in a few minutes a day.
          </p>
          <div className="mt-4">
            <NewsletterModal />
          </div>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-primary mb-2">Contact</h2>
          <p>
            Questions, feedback, or press inquiries? Reach us at{' '}
            <a href="mailto:news@theamericanexpress.us" className="text-accent hover:underline">
              news@theamericanexpress.us
            </a>{' '}
            or visit our{' '}
            <a href="/contact" className="text-accent hover:underline">contact page</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
