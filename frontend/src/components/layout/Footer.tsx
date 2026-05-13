import Link from 'next/link';
import { Download } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const tools = [
    { href: '/tools/youtube-downloader', label: 'YouTube Downloader' },
    { href: '/tools/tiktok-downloader', label: 'TikTok Downloader' },
    { href: '/tools/instagram-downloader', label: 'Instagram Downloader' },
    { href: '/tools/twitter-downloader', label: 'Twitter Downloader' },
    { href: '/tools/facebook-downloader', label: 'Facebook Downloader' },
    { href: '/tools/pinterest-downloader', label: 'Pinterest Downloader' },
  ];

  const company = [
    { href: '/blog', label: 'Blog' },
    { href: '/contact', label: 'Contact' },
    { href: '/legal/privacy', label: 'Privacy Policy' },
    { href: '/legal/terms', label: 'Terms of Service' },
    { href: '/legal/dmca', label: 'DMCA' },
  ];

  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2 font-bold text-xl mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-accent-500 rounded-lg flex items-center justify-center">
                <Download className="w-4 h-4 text-white" />
              </div>
              <span className="gradient-text">FetchClip Pro</span>
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
              The fastest, cleanest way to download videos from any platform. Free forever, no signup required.
            </p>
          </div>

          {/* Tools */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Downloader Tools</h3>
            <ul className="space-y-2">
              {tools.map(t => (
                <li key={t.href}>
                  <Link href={t.href} className="text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors">
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Company</h3>
            <ul className="space-y-2">
              {company.map(c => (
                <li key={c.href}>
                  <Link href={c.href} className="text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors">
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">
            © {currentYear} FetchClip Pro. All rights reserved.
          </p>
          <p className="text-xs text-gray-400 max-w-md text-center">
            FetchClip Pro is intended for downloading publicly available media for personal use only.
            Respect copyright laws and platform terms of service.
          </p>
        </div>
      </div>
    </footer>
  );
}
