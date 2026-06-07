import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch with The American Express Times — questions, feedback, corrections, or advertising inquiries.',
}

export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8 border-b-4 border-double border-primary pb-5">
        <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">
          The American Express Times
        </p>
        <h1 className="font-serif text-4xl font-bold text-primary">Contact Us</h1>
        <p className="text-gray-500 text-sm mt-2">We read every message.</p>
      </div>

      <div className="space-y-6 text-gray-700 leading-relaxed text-[15px]">
        <p>
          Have a question, a correction, feedback on a story, or an advertising inquiry?
          We&rsquo;d love to hear from you. The best way to reach us is by email — we typically
          respond within a couple of business days.
        </p>

        <div className="bg-white border border-gray-200 border-l-4 border-l-accent rounded p-6">
          <h2 className="font-serif text-xl font-bold text-primary mb-3">Email</h2>
          <p className="mb-4">
            <a href="mailto:news@theamericanexpress.us"
              className="text-accent font-semibold hover:underline text-lg">
              news@theamericanexpress.us
            </a>
          </p>
          <ul className="text-sm text-gray-600 space-y-1.5">
            <li><strong>General &amp; feedback</strong> — questions about our coverage or the newsletter</li>
            <li><strong>Corrections</strong> — spotted an error? Let us know and we&rsquo;ll review it</li>
            <li><strong>Advertising</strong> — interested in reaching our readers? Get in touch</li>
          </ul>
        </div>

        <section>
          <h2 className="font-serif text-2xl font-bold text-primary mb-2">Newsletter</h2>
          <p>
            To stop receiving our daily digest, use the unsubscribe link at the bottom of any email
            — it removes you instantly. To subscribe, use the &ldquo;Subscribe&rdquo; button in the
            site navigation.
          </p>
        </section>
      </div>
    </div>
  )
}
