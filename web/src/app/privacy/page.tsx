import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How The American Express Times collects, uses, and protects your information, including cookies, analytics, and advertising.',
}

const UPDATED = 'June 7, 2026'

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8 border-b-4 border-double border-primary pb-5">
        <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">
          The American Express Times
        </p>
        <h1 className="font-serif text-4xl font-bold text-primary">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mt-2">Last updated: {UPDATED}</p>
      </div>

      <div className="space-y-6 text-gray-700 leading-relaxed text-[15px]">
        <p>
          The American Express Times (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;)
          operates the website <strong>theamericanexpress.us</strong> and an email newsletter. This
          Privacy Policy explains what information we collect, how we use it, and the choices you
          have. By using our website or subscribing to our newsletter, you agree to this policy.
        </p>

        <Section title="Information We Collect">
          <p><strong>Information you provide.</strong> When you subscribe to our newsletter, we
          collect your email address. We do not ask for or require any other personal details to
          subscribe.</p>
          <p className="mt-3"><strong>Information collected automatically.</strong> When you visit
          our website, our servers and analytics tools may automatically record standard log
          information such as your browser type, device type, referring pages, approximate location
          (country/region), and the pages you view. This data is aggregated and is not used to
          personally identify you.</p>
        </Section>

        <Section title="Cookies and Analytics">
          <p>We use <strong>Google Analytics</strong> to understand how visitors use our site
          (for example, which articles are most read). Google Analytics uses cookies and similar
          technologies to collect usage data. This information helps us improve our content and
          experience.</p>
          <p className="mt-3">You can opt out of Google Analytics by installing the{' '}
          <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer"
            className="text-accent hover:underline">Google Analytics Opt-out Browser Add-on</a>, or
          by disabling cookies in your browser settings.</p>
        </Section>

        <Section title="Advertising">
          <p>We may display advertising on our website through third-party advertising partners,
          which may include <strong>Google AdSense</strong>.</p>
          <ul className="list-disc pl-6 mt-3 space-y-1.5">
            <li>Third-party vendors, including Google, use cookies to serve ads based on your prior
            visits to our website or other websites.</li>
            <li>Google&rsquo;s use of advertising cookies enables it and its partners to serve ads to
            you based on your visit to our site and/or other sites on the Internet.</li>
            <li>You may opt out of personalized advertising by visiting{' '}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer"
              className="text-accent hover:underline">Google Ads Settings</a>, or opt out of
            third-party vendors&rsquo; use of cookies for personalized advertising at{' '}
            <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer"
              className="text-accent hover:underline">aboutads.info/choices</a>.</li>
          </ul>
        </Section>

        <Section title="How We Use Your Information">
          <ul className="list-disc pl-6 space-y-1.5">
            <li>To send you the email newsletter you subscribed to.</li>
            <li>To operate, maintain, and improve our website and content.</li>
            <li>To understand aggregate readership trends.</li>
            <li>To comply with legal obligations.</li>
          </ul>
          <p className="mt-3">We do <strong>not</strong> sell your personal information.</p>
        </Section>

        <Section title="Third-Party Services">
          <p>We rely on trusted third-party providers to operate our service, including{' '}
          <strong>SendGrid</strong> (email delivery), <strong>Supabase</strong> (data hosting),
          and <strong>Google</strong> (analytics and advertising). These providers process data
          only as needed to provide their services and under their own privacy policies.</p>
        </Section>

        <Section title="Your Choices and Rights">
          <p>You can unsubscribe from our newsletter at any time using the unsubscribe link in any
          email we send — this immediately removes your email from our list. You may also contact
          us to request access to or deletion of any personal information we hold about you.</p>
        </Section>

        <Section title="Children's Privacy">
          <p>Our website and newsletter are not directed to children under 13, and we do not
          knowingly collect personal information from children.</p>
        </Section>

        <Section title="Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. Changes will be posted on this
          page with an updated &ldquo;Last updated&rdquo; date.</p>
        </Section>

        <Section title="Contact Us">
          <p>If you have any questions about this Privacy Policy, contact us at{' '}
          <a href="mailto:news@theamericanexpress.us" className="text-accent hover:underline">
            news@theamericanexpress.us</a>.</p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-2xl font-bold text-primary mb-2">{title}</h2>
      {children}
    </section>
  )
}
