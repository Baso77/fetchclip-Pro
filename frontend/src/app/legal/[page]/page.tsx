import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://fetchclip.pro';

const LEGAL: Record<string, { title: string; content: string }> = {
  privacy: {
    title: 'Privacy Policy',
    content: `
Last updated: January 2025

**Information We Collect**

FetchClip Pro is designed with privacy as a core principle. We collect minimal data necessary to operate the service:

- **Usage Data**: We log download requests with anonymized IP hashes (not raw IPs) for abuse prevention and analytics. No personally identifiable information is stored.
- **Contact Form**: If you contact us, we store your name, email, and message.
- **Cookies**: We use no tracking or advertising cookies. We use a theme preference cookie (localStorage) only.

**How We Use Information**

- To provide and improve the downloader service
- To prevent abuse and enforce rate limits
- To respond to contact requests
- Aggregated, anonymous analytics to understand platform usage

**What We Do NOT Do**

- We do not sell your data to any third party
- We do not show targeted advertising based on your behavior
- We do not store your downloaded media files
- We do not track you across websites

**Third-Party Services**

We use Supabase for database storage (governed by their privacy policy). Railway or Render hosts our backend. Vercel hosts our frontend.

**Data Retention**

Download logs are retained for 30 days for abuse prevention, then automatically deleted. Contact messages are retained for 90 days.

**Your Rights**

You may request deletion of any data associated with your contact information by emailing us.

**Contact**

For privacy questions: privacy@fetchclip.pro
    `,
  },
  terms: {
    title: 'Terms of Service',
    content: `
Last updated: January 2025

**Acceptance of Terms**

By using FetchClip Pro, you agree to these Terms of Service. If you do not agree, do not use the service.

**Service Description**

FetchClip Pro is a tool that helps users access publicly available media content for personal use.

**Acceptable Use**

You may use FetchClip Pro only for:
- Downloading publicly available media for personal offline viewing
- Content you have the right to download
- Legal purposes in your jurisdiction

**Prohibited Uses**

You must NOT use FetchClip Pro to:
- Download copyrighted content for redistribution or commercial purposes
- Download private or restricted content without authorization
- Circumvent digital rights management (DRM) systems
- Use the service in automated or bot-like fashion beyond normal personal use
- Download content that violates the source platform's terms of service

**Copyright and DMCA**

FetchClip Pro respects intellectual property rights. We comply with the Digital Millennium Copyright Act (DMCA). If you believe content downloaded via our service infringes your copyright, see our DMCA policy.

**Disclaimer of Warranties**

The service is provided "as is" without warranty of any kind. We do not guarantee uptime, availability, or compatibility with all URLs.

**Limitation of Liability**

FetchClip Pro is not liable for any indirect, incidental, or consequential damages arising from use of the service.

**Changes to Terms**

We may update these terms at any time. Continued use of the service constitutes acceptance of updated terms.

**Contact**

legal@fetchclip.pro
    `,
  },
  dmca: {
    title: 'DMCA Policy',
    content: `
Last updated: January 2025

**DMCA Compliance**

FetchClip Pro respects the intellectual property rights of content creators and complies with the Digital Millennium Copyright Act (DMCA).

**What FetchClip Pro Does**

FetchClip Pro is a tool that extracts publicly available media URLs from supported platforms. We do not host, store, or distribute copyrighted content on our servers. Media files are delivered directly from the source platform's CDN to the user's browser.

**Filing a DMCA Notice**

If you are a copyright holder and believe that content accessible through our service infringes your copyright, please send a DMCA notice to:

dmca@fetchclip.pro

Your notice must include:
1. Your full legal name and contact information
2. Identification of the copyrighted work claimed to be infringed
3. The specific URL(s) accessed through our service
4. A statement that you have a good faith belief the use is not authorized
5. A statement under penalty of perjury that the information is accurate
6. Your physical or electronic signature

**Response Process**

We will respond to valid DMCA notices within 5 business days. For valid claims, we will block the relevant URLs from being processed by our service.

**Counter-Notifications**

If you believe content was wrongfully blocked, you may file a counter-notification per DMCA Section 512(g).

**Repeat Infringers**

We maintain a policy of terminating service to repeat infringers.

**Contact**

dmca@fetchclip.pro
    `,
  },
};

type Props = { params: Promise<{ page: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await params;
  const content = LEGAL[page];
  if (!content) return {};
  return {
    title: `${content.title} — FetchClip Pro`,
    alternates: { canonical: `/legal/${page}` },
    robots: { index: true, follow: false },
  };
}

export function generateStaticParams() {
  return Object.keys(LEGAL).map(page => ({ page }));
}

export default async function LegalPage({ params }: Props) {
  const { page } = await params;
  const content = LEGAL[page];
  if (!content) notFound();

  const paragraphs = content.content.trim().split('\n\n');

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-10">{content.title}</h1>
          <div className="glass-card p-8 space-y-5">
            {paragraphs.map((para, i) => {
              const trimmed = para.trim();
              if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.slice(2).includes('**')) {
                return <h2 key={i} className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-6">{trimmed.slice(2, -2)}</h2>;
              }
              return (
                <p key={i} className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm"
                  dangerouslySetInnerHTML={{
                    __html: trimmed
                      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br />')
                  }}
                />
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
