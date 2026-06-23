import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Editorial Standards',
  description:
    'How The American Express Times reports the news: our sourcing, our commitment to balance, our accuracy and corrections policy, and our independence.',
}

export default function EditorialStandardsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8 border-b-4 border-double border-primary pb-5">
        <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">
          The American Express Times
        </p>
        <h1 className="font-serif text-4xl font-bold text-primary">Editorial Standards</h1>
        <p className="text-gray-500 text-sm mt-2">
          How we report, source, and stand behind our journalism.
        </p>
      </div>

      <div className="space-y-6 text-gray-700 leading-relaxed text-[15px]">
        <p>
          The American Express Times exists to help readers understand the day&rsquo;s most
          important stories clearly and fairly. These standards explain how we work and how we hold
          ourselves accountable to you.
        </p>

        <Section title="Our Mission">
          <p>
            We are an independent publication committed to balanced, unbiased reporting. Our promise
            is simple: a reader on the left and a reader on the right should both finish one of our
            articles feeling it was reported fairly. We tell you what happened and how it is being
            reported across the spectrum — without telling you what to think.
          </p>
        </Section>

        <Section title="Sourcing &amp; Methodology">
          <p>
            For each major story, our editorial process reviews how a wide range of established,
            independent news outlets — domestic and international, across the political spectrum — are
            covering the same event. We then produce a single, original article that fairly
            represents those multiple perspectives.
          </p>
          <p className="mt-3">
            Where outlets disagree on facts or framing, we present that disagreement plainly rather
            than picking a side. We do not reproduce or copy source articles; every piece is written
            as an original synthesis for our readers.
          </p>
        </Section>

        <Section title="Accuracy &amp; Corrections">
          <p>
            We work to be accurate, but no newsroom is perfect. If you believe we have published
            something incorrect, please tell us at{' '}
            <a href="mailto:news@theamericanexpress.us" className="text-accent hover:underline">
              news@theamericanexpress.us
            </a>
            . We review every correction request promptly and update or annotate articles when a
            factual error is confirmed.
          </p>
        </Section>

        <Section title="Independence &amp; Impartiality">
          <p>
            We are editorially independent. Our reporting is not directed by any political party,
            campaign, advertiser, or outside interest. Opinion and analysis, when published, appear
            in our clearly labeled Editorial section and are kept separate from our news reporting.
          </p>
        </Section>

        <Section title="Advertising &amp; Sponsorship">
          <p>
            We may carry advertising and sponsored placements to fund our work. Advertising never
            influences our reporting or editorial judgment, and sponsored content is always clearly
            labeled as such so readers can tell the difference between journalism and paid messages.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about our standards, a correction, or feedback on our coverage? Reach our
            editorial team at{' '}
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
