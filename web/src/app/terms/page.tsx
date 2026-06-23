import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms and conditions for using The American Express Times website and newsletter.',
}

const UPDATED = 'June 23, 2026'

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8 border-b-4 border-double border-primary pb-5">
        <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">
          The American Express Times
        </p>
        <h1 className="font-serif text-4xl font-bold text-primary">Terms of Service</h1>
        <p className="text-gray-500 text-sm mt-2">Last updated: {UPDATED}</p>
      </div>

      <div className="space-y-6 text-gray-700 leading-relaxed text-[15px]">
        <p>
          Welcome to The American Express Times. By accessing or using our website
          (theamericanexpress.us) or subscribing to our newsletter, you agree to these Terms of
          Service. If you do not agree, please do not use the site.
        </p>

        <Section title="Use of the Site">
          <p>
            You may read, share, and link to our content for personal, non-commercial use. You agree
            not to misuse the site — including attempting to disrupt it, access it through automated
            means at scale, or use it for any unlawful purpose.
          </p>
        </Section>

        <Section title="Intellectual Property">
          <p>
            The original articles, design, and branding on this site are the property of The American
            Express Times and are protected by applicable intellectual property laws. You may quote
            brief excerpts with attribution and a link, but you may not republish full articles
            without our written permission.
          </p>
        </Section>

        <Section title="Newsletter">
          <p>
            By subscribing, you consent to receive our email digest. You can unsubscribe at any time
            using the link in any email, which removes you from our list immediately.
          </p>
        </Section>

        <Section title="Accuracy &amp; Disclaimers">
          <p>
            We work to report accurately, but the content is provided &ldquo;as is&rdquo; for general
            information only and without warranties of any kind. We do not guarantee that the site
            will be error-free or uninterrupted, and we are not liable for any decisions made based on
            our content. See our{' '}
            <a href="/editorial-standards" className="text-accent hover:underline">Editorial Standards</a>{' '}
            for how we handle corrections.
          </p>
        </Section>

        <Section title="External Links &amp; Advertising">
          <p>
            Our site may contain links to third-party websites and may display advertising from
            third parties. We are not responsible for the content, products, or practices of those
            third parties. Advertising does not influence our editorial coverage.
          </p>
        </Section>

        <Section title="Limitation of Liability">
          <p>
            To the fullest extent permitted by law, The American Express Times shall not be liable for
            any indirect, incidental, or consequential damages arising from your use of the site or
            reliance on its content.
          </p>
        </Section>

        <Section title="Changes to These Terms">
          <p>
            We may update these Terms from time to time. Continued use of the site after changes are
            posted constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these Terms? Contact us at{' '}
            <a href="mailto:news@theamericanexpress.us" className="text-accent hover:underline">
              news@theamericanexpress.us
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-2xl font-bold text-primary mb-2"
        dangerouslySetInnerHTML={{ __html: title }} />
      {children}
    </section>
  )
}
