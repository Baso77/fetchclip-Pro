import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
// @ts-ignore: Importing global CSS without explicit type declarations
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://fetchclip.pro';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default:
      'FetchClip Pro — Free Video Downloader for YouTube, TikTok, Instagram & More',
    template: '%s | FetchClip Pro',
  },

  description:
    'Download videos from YouTube, TikTok, Instagram, Facebook, Twitter/X and Pinterest in HD. Free, no signup required.',

  keywords: [
    'video downloader',
    'youtube downloader',
    'instagram downloader',
    'tiktok downloader',
  ],

  authors: [{ name: 'FetchClip Pro' }],

  openGraph: {
    title: 'FetchClip Pro',
    description:
      'Download videos from YouTube, TikTok, Instagram and more.',
    url: SITE_URL,
    siteName: 'FetchClip Pro',
    locale: 'en_US',
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'FetchClip Pro',
    description:
      'Download videos from YouTube, TikTok, Instagram and more.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans bg-white text-gray-900 antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}