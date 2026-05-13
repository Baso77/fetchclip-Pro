import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Blog — FetchClip Pro',
  description: 'Tips, guides and news about video downloading, social media content and FetchClip Pro features.',
};

const POSTS = [
  {
    slug: 'how-to-download-youtube-videos',
    title: 'How to Download YouTube Videos in 2025 (Complete Guide)',
    excerpt: 'Step-by-step guide to downloading YouTube videos in any quality, including 4K and audio-only extraction.',
    date: '2025-01-10',
    readTime: '5 min read',
    category: 'YouTube',
  },
  {
    slug: 'tiktok-video-download-guide',
    title: 'Download TikTok Videos Without Watermark',
    excerpt: 'Learn how to save TikTok videos to your device without the TikTok watermark. Works on iPhone, Android and desktop.',
    date: '2025-01-08',
    readTime: '4 min read',
    category: 'TikTok',
  },
  {
    slug: 'instagram-reels-download',
    title: 'How to Download Instagram Reels to Your Phone',
    excerpt: 'Save Instagram Reels in HD quality directly to your camera roll without any apps or accounts.',
    date: '2025-01-05',
    readTime: '3 min read',
    category: 'Instagram',
  },
  {
    slug: 'is-it-legal-to-download-videos',
    title: 'Is It Legal to Download Videos from Social Media?',
    excerpt: 'An honest look at the legal considerations around downloading publicly available social media content for personal use.',
    date: '2025-01-02',
    readTime: '7 min read',
    category: 'General',
  },
];

export default function BlogPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Blog</h1>
            <p className="text-gray-500 dark:text-gray-400">Guides, tips and news about video downloading</p>
          </div>

          <div className="grid gap-6">
            {POSTS.map(post => (
              <Link key={post.slug} href={`/blog/${post.slug}`}
                className="glass-card p-6 hover:shadow-lg transition-all duration-200 group">
                <div className="flex items-center gap-2 mb-3">
                  <span className="platform-badge">{post.category}</span>
                  <span className="text-xs text-gray-400">{post.readTime}</span>
                  <span className="text-xs text-gray-400">{new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-brand-500 transition-colors">
                  {post.title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{post.excerpt}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
