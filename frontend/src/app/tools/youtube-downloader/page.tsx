import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Clock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'YouTube Downloader — Coming Soon — FetchClip Pro',
  description: 'YouTube video downloader is coming soon to FetchClip Pro. For now, download from TikTok, Instagram, Facebook, Twitter/X and Pinterest.',
  robots: { index: false, follow: true },
};

export default function YouTubeDownloaderPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16 min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          
          {/* Coming Soon Banner */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-sm font-medium px-4 py-2 rounded-full border border-amber-200 dark:border-amber-700 mb-6">
              <Clock className="w-4 h-4" />
              Coming Soon
            </div>
            
            <div className="text-8xl mb-6">▶️</div>
            
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              YouTube Downloader
              <br />
              <span className="text-2xl sm:text-3xl text-amber-500">Coming Soon</span>
            </h1>
            
            <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto mb-8 leading-relaxed">
              We are actively working on YouTube support. YouTube requires special handling to bypass bot protection. 
              We will notify you once it is live!
            </p>

            <div className="glass-card p-6 mb-8 text-left">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Why is YouTube taking longer?</h2>
              <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  YouTube has strict bot detection and requires cookies/authentication
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  We are building a reliable solution that won&apos;t break frequently
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  Expected launch: Very soon!
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/" className="btn-primary inline-flex items-center gap-2 justify-center">
                <ArrowLeft className="w-4 h-4" />
                Try Other Platforms
              </Link>
            </div>
          </div>

          {/* Alternative platforms */}
          <div className="mt-12">
            <p className="text-sm text-gray-400 mb-4">In the meantime, these platforms work perfectly:</p>
            <div className="flex flex-wrap gap-3 justify-center">
              {[
                { name: 'TikTok', path: '/tools/tiktok-downloader', emoji: '🎵' },
                { name: 'Instagram', path: '/tools/instagram-downloader', emoji: '📸' },
                { name: 'Twitter/X', path: '/tools/twitter-downloader', emoji: '𝕏' },
                { name: 'Facebook', path: '/tools/facebook-downloader', emoji: 'f' },
                { name: 'Pinterest', path: '/tools/pinterest-downloader', emoji: '𝐏' },
              ].map(p => (
                <Link key={p.name} href={p.path}
                  className="glass-card px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-500 transition-colors flex items-center gap-2">
                  <span>{p.emoji}</span>
                  {p.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}