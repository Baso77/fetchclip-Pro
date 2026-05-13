import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import DownloaderCard from '@/components/downloader/DownloaderCard';

const TOOL_CONFIG: Record<string, {
  platform: string; emoji: string; color: string;
  title: string; description: string; metaDesc: string;
  supported: string[]; notes: string;
}> = {
  'tiktok-downloader': {
    platform: 'TikTok', emoji: '🎵', color: 'bg-gray-900 dark:bg-gray-800 text-white',
    title: 'TikTok Video Downloader', description: 'Download TikTok videos without watermark in HD. Free, no account required.',
    metaDesc: 'Download TikTok videos without watermark for free. HD quality. No signup, works on mobile and desktop.',
    supported: ['TikTok videos', 'TikTok Reels', 'TikTok Slideshows (video format)'],
    notes: 'Private TikTok accounts and LIVE videos cannot be downloaded.',
  },
  'instagram-downloader': {
    platform: 'Instagram', emoji: '📸', color: 'bg-gradient-to-r from-pink-500 to-purple-600 text-white',
    title: 'Instagram Video Downloader', description: 'Download Instagram Reels, videos and posts in HD. Free and fast.',
    metaDesc: 'Download Instagram Reels, videos and posts for free in HD. No login, no watermark. Works instantly.',
    supported: ['Instagram Reels', 'Instagram video posts', 'IGTV videos'],
    notes: 'Instagram Stories and content from private accounts cannot be downloaded.',
  },
  'twitter-downloader': {
    platform: 'Twitter/X', emoji: '𝕏', color: 'bg-sky-500 text-white',
    title: 'Twitter / X Video Downloader', description: 'Download videos and GIFs from Twitter and X.com. Free, instant.',
    metaDesc: 'Download Twitter and X videos and GIFs for free. HD quality, no signup, instant browser download.',
    supported: ['Twitter/X video tweets', 'Twitter/X GIFs', 'Quote tweet videos'],
    notes: 'Videos from protected (private) accounts cannot be downloaded.',
  },
  'facebook-downloader': {
    platform: 'Facebook', emoji: 'f', color: 'bg-blue-600 text-white',
    title: 'Facebook Video Downloader', description: 'Download public Facebook videos in HD. Free, no login needed.',
    metaDesc: 'Download Facebook videos for free in HD quality. No login required. Works on all devices instantly.',
    supported: ['Public Facebook videos', 'Facebook Reels', 'Facebook Watch videos'],
    notes: 'Private Facebook videos and content from locked profiles cannot be downloaded.',
  },
  'pinterest-downloader': {
    platform: 'Pinterest', emoji: '𝐏', color: 'bg-red-600 text-white',
    title: 'Pinterest Video Downloader', description: 'Download Pinterest videos and Idea Pins. Free and instant.',
    metaDesc: 'Download Pinterest videos and Idea Pins for free. No signup. HD quality. Works on all browsers.',
    supported: ['Pinterest video pins', 'Pinterest Idea Pins (video)', 'Pinterest Story Pins'],
    notes: 'Static image pins cannot be downloaded as video.',
  },
};

type Props = { params: Promise<{ tool: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tool } = await params;
  const config = TOOL_CONFIG[tool];
  if (!config) return {};
  return {
    title: `${config.title} — FetchClip Pro`,
    description: config.metaDesc,
    alternates: { canonical: `/tools/${tool}` },
  };
}

export function generateStaticParams() {
  return Object.keys(TOOL_CONFIG).map(tool => ({ tool }));
}

export default async function ToolPage({ params }: Props) {
  const { tool } = await params;
  const config = TOOL_CONFIG[tool];
  if (!config) notFound();

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className={`inline-flex items-center gap-2 text-sm font-medium px-4 py-1.5 rounded-full mb-6 ${config.color}`}>
              {config.emoji} {config.platform} Downloader
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">{config.title}</h1>
            <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">{config.description}</p>
          </div>

          <DownloaderCard />

          <div className="mt-20 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Supported {config.platform} Content</h2>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400 list-disc list-inside mb-6">
              {config.supported.map(s => <li key={s}>{s}</li>)}
            </ul>
            <p className="text-sm text-gray-400">{config.notes}</p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
