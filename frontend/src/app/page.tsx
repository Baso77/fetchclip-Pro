import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import DownloaderCard from '@/components/downloader/DownloaderCard';
import { Shield, Zap, Globe, Lock, Star, CheckCircle, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'FetchClip Pro — Free Video Downloader for TikTok, Instagram, Facebook & More',
  description: 'Download videos in HD from TikTok, Instagram, Facebook, Twitter/X and Pinterest. Free, no signup, instant browser download.',
};

const PLATFORMS = [
  { name: 'YouTube', icon: '▶️', color: 'from-red-400 to-red-500', path: '#', comingSoon: true },
  { name: 'TikTok', icon: '🎵', color: 'from-gray-700 to-gray-900', path: '/tools/tiktok-downloader', comingSoon: false },
  { name: 'Instagram', icon: '📸', color: 'from-pink-500 to-purple-600', path: '/tools/instagram-downloader', comingSoon: false },
  { name: 'Twitter/X', icon: '𝕏', color: 'from-sky-500 to-sky-600', path: '/tools/twitter-downloader', comingSoon: false },
  { name: 'Facebook', icon: 'f', color: 'from-blue-600 to-blue-700', path: '/tools/facebook-downloader', comingSoon: false },
  { name: 'Pinterest', icon: '𝐏', color: 'from-red-600 to-red-700', path: '/tools/pinterest-downloader', comingSoon: false },
];

const FEATURES = [
  { icon: Zap, title: 'Lightning Fast', desc: 'Metadata extracted in seconds. Direct download, no re-encoding delay.' },
  { icon: Shield, title: 'Safe & Private', desc: 'No tracking, no account required. Your downloads stay private.' },
  { icon: Globe, title: '5 Platforms', desc: 'TikTok, Instagram, Facebook, Twitter/X and Pinterest. YouTube coming soon!' },
  { icon: Lock, title: 'Secure', desc: 'All connections encrypted. We never store your media files.' },
];

const FAQS = [
  { q: 'Is FetchClip Pro free to use?', a: 'Yes, completely free. No signup, no account, no subscription. Paste URL and download.' },
  { q: 'What video quality can I download?', a: 'We offer all available qualities up to the highest available for each platform.' },
  { q: 'Can I download audio only?', a: 'Yes! Every video has an "Audio Only" button that extracts just the audio track in M4A format.' },
  { q: 'Is YouTube supported?', a: 'YouTube support is coming soon! We are working on it. Currently we support TikTok, Instagram, Facebook, Twitter/X, and Pinterest.' },
  { q: 'Is it legal to download videos?', a: 'Downloading for personal offline viewing of publicly available content is generally permitted. Always respect copyright and platform terms of service. Never redistribute downloaded content.' },
  { q: 'Why is my download not working?', a: 'Private videos, region-locked content, and live streams cannot be downloaded. Make sure the URL is from a supported platform and the content is publicly accessible.' },
];

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main>
        {/* Hero */}
        <section className="relative pt-28 pb-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-accent-50/30 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900" />
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-brand-400/10 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-96 h-96 bg-accent-400/10 rounded-full blur-3xl" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 text-sm font-medium px-4 py-1.5 rounded-full mb-6 border border-brand-200/50 dark:border-brand-700/50">
              <Star className="w-3.5 h-3.5 fill-current" />
              Free forever · No signup required
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Download Any Video,{' '}
              <span className="gradient-text">Instantly</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
              Paste a URL from TikTok, Instagram, Facebook, Twitter or Pinterest.
              Get HD video, audio, or thumbnails — directly in your browser. No software. No limits.
            </p>

            <DownloaderCard />

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-400 dark:text-gray-500">
              {['No signup', 'No watermarks', 'HD quality', 'Audio extraction', 'Free forever'].map(f => (
                <span key={f} className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-brand-500" />
                  {f}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Platforms */}
        <section className="py-20 bg-gray-50 dark:bg-gray-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-3">Supported Platforms</h2>
              <p className="text-gray-500 dark:text-gray-400">Download from all the biggest social media platforms</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {PLATFORMS.map(p => (
                p.comingSoon ? (
                  // YouTube — coming soon tile (not clickable)
                  <div key={p.name}
                    className="glass-card p-5 text-center relative opacity-70 cursor-not-allowed">
                    <div className={`w-12 h-12 bg-gradient-to-br ${p.color} rounded-xl flex items-center justify-center text-white text-lg font-bold mx-auto mb-3 opacity-60`}>
                      {p.icon}
                    </div>
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 block">{p.name}</span>
                    <div className="mt-2 inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-medium px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" />
                      Soon
                    </div>
                  </div>
                ) : (
                  <a key={p.name} href={p.path}
                    className="glass-card p-5 text-center hover:scale-105 transition-all duration-200 cursor-pointer group">
                    <div className={`w-12 h-12 bg-gradient-to-br ${p.color} rounded-xl flex items-center justify-center text-white text-lg font-bold mx-auto mb-3 group-hover:shadow-lg transition-shadow`}>
                      {p.icon}
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{p.name}</span>
                  </a>
                )
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-3">Why FetchClip Pro?</h2>
              <p className="text-gray-500 dark:text-gray-400">Built for speed, privacy and reliability</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {FEATURES.map(f => (
                <div key={f.title} className="glass-card p-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-brand-500/20 to-accent-500/20 rounded-xl flex items-center justify-center mb-4">
                    <f.icon className="w-5 h-5 text-brand-500" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 bg-gray-50 dark:bg-gray-900/50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-12">How It Works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
                { step: '1', title: 'Copy URL', desc: 'Copy the link from any supported platform' },
                { step: '2', title: 'Paste & Fetch', desc: 'Paste the URL and click Fetch to see all available formats' },
                { step: '3', title: 'Download', desc: 'Choose quality and click Download — saves directly to your device' },
              ].map(s => (
                <div key={s.step} className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-accent-500 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4 shadow-lg shadow-brand-500/30">
                    {s.step}
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-3">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-4">
              {FAQS.map(faq => (
                <div key={faq.q} className="glass-card p-6">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{faq.q}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}