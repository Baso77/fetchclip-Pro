import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import {
  Zap, Shield, Globe, Lock, Music, Image, Download,
  Smartphone, Clock, CheckCircle, Wifi, Star,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Features — FetchClip Pro',
  description: 'Everything FetchClip Pro can do — HD video downloads, audio extraction, thumbnail saving, and more. Free, no signup required.',
};

const FEATURES = [
  {
    icon: Zap,
    title: 'Lightning Fast Fetching',
    desc: 'Paste any URL and get all available formats in seconds. Our backend extracts metadata instantly without making you wait.',
    color: 'from-yellow-400 to-orange-500',
  },
  {
    icon: Download,
    title: 'HD Video Download',
    desc: 'Download videos in the highest quality available — up to 1080p for Instagram, TikTok, Facebook, Twitter and Pinterest. Video always includes audio.',
    color: 'from-brand-500 to-brand-600',
  },
  {
    icon: Music,
    title: 'Audio Only Extraction',
    desc: 'Extract just the audio from any video in M4A format. Perfect for saving music, podcasts, or any audio content without the video.',
    color: 'from-purple-500 to-accent-500',
  },
  {
    icon: Image,
    title: 'Thumbnail Download',
    desc: 'Save the thumbnail image from any video with one click. Great for content creators and designers who need cover images.',
    color: 'from-pink-500 to-rose-500',
  },
  {
    icon: Shield,
    title: 'Private & Secure',
    desc: 'We never store your downloaded files on our servers. No tracking, no history, no account required. Your activity stays completely private.',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: Globe,
    title: 'Multi-Platform Support',
    desc: 'Works with TikTok, Instagram, Facebook, Twitter/X, Pinterest, Reddit and Vimeo. YouTube support is coming soon.',
    color: 'from-sky-500 to-blue-500',
  },
  {
    icon: Smartphone,
    title: 'Works on All Devices',
    desc: 'Fully responsive design works perfectly on iPhone, Android, tablets, and desktop browsers. No app download needed.',
    color: 'from-indigo-500 to-purple-500',
  },
  {
    icon: Lock,
    title: 'No Login Required',
    desc: 'No account, no signup, no email — just paste a URL and download. We respect your time and privacy.',
    color: 'from-gray-600 to-gray-800',
  },
  {
    icon: Wifi,
    title: 'Direct Browser Download',
    desc: 'Downloads go straight to your Chrome download bar. No redirects, no extra pages, no popups. One click and it is downloading.',
    color: 'from-teal-500 to-cyan-500',
  },
  {
    icon: Clock,
    title: 'Always Free',
    desc: 'FetchClip Pro is completely free to use with no hidden limits, no watermarks, and no premium tiers. Free forever.',
    color: 'from-amber-500 to-yellow-500',
  },
  {
    icon: Star,
    title: 'Quality Selection',
    desc: 'Choose from all available resolutions before downloading. Pick the quality that fits your storage or viewing needs.',
    color: 'from-red-500 to-pink-500',
  },
  {
    icon: CheckCircle,
    title: 'No Watermarks',
    desc: 'Downloads are clean — no FetchClip watermark, no platform watermark overlay added by us. You get the original content.',
    color: 'from-lime-500 to-green-500',
  },
];

const PLATFORMS = [
  { name: 'TikTok', emoji: '🎵', status: 'live' },
  { name: 'Instagram', emoji: '📸', status: 'live' },
  { name: 'Facebook', emoji: 'f', status: 'live' },
  { name: 'Twitter / X', emoji: '𝕏', status: 'live' },
  { name: 'Pinterest', emoji: '𝐏', status: 'live' },
  { name: 'Reddit', emoji: '🤖', status: 'live' },
  { name: 'Vimeo', emoji: '🎬', status: 'live' },
  { name: 'YouTube', emoji: '▶️', status: 'soon' },
];

export default function FeaturesPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 text-sm font-medium px-4 py-1.5 rounded-full mb-6 border border-brand-200/50 dark:border-brand-700/50">
              <Star className="w-3.5 h-3.5 fill-current" />
              Everything is free
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              Powerful Features,{' '}
              <span className="gradient-text">Zero Cost</span>
            </h1>
            <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
              FetchClip Pro packs everything you need to download social media content — fast, clean, and completely free.
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
            {FEATURES.map(f => (
              <div key={f.title} className="glass-card p-6 hover:shadow-lg transition-shadow duration-200">
                <div className={`w-11 h-11 bg-gradient-to-br ${f.color} rounded-xl flex items-center justify-center mb-4 shadow-sm`}>
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Platform support table */}
          <div className="glass-card p-8 mb-20">
            <h2 className="text-2xl font-bold text-center mb-8">Platform Support</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {PLATFORMS.map(p => (
                <div key={p.name} className={`flex items-center gap-3 p-3 rounded-xl ${p.status === 'live' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                  <span className="text-xl">{p.emoji}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                    {p.status === 'live' ? (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
                        Live
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to download?</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8">No signup needed. Just paste a URL and go.</p>
            <a href="/" className="btn-primary inline-flex items-center gap-2 text-base px-8 py-3">
              <Download className="w-5 h-5" />
              Start Downloading Free
            </a>
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}