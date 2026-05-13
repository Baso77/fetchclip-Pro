import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import DownloaderCard from '@/components/downloader/DownloaderCard';

export const metadata: Metadata = {
  title: 'YouTube Video Downloader — Download YouTube Videos in HD Free',
  description: 'Download YouTube videos in 4K, 1080p, 720p, 480p for free. Also download audio as MP3/M4A. No signup, no software required. Works on mobile and desktop.',
  alternates: { canonical: '/tools/youtube-downloader' },
  openGraph: {
    title: 'YouTube Video Downloader — FetchClip Pro',
    description: 'Download YouTube videos in HD quality. Free, fast, no signup.',
  },
};

export default function YouTubeDownloaderPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-medium px-4 py-1.5 rounded-full mb-6 border border-red-200/50 dark:border-red-700/50">
              ▶️ YouTube Downloader
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              YouTube Video Downloader
            </h1>
            <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
              Download any YouTube video in HD, 4K, or extract audio as MP3/M4A. Free, instant, no account needed.
            </p>
          </div>

          <DownloaderCard />

          <div className="mt-20 prose prose-gray dark:prose-invert max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">How to Download YouTube Videos</h2>
            <ol className="space-y-3 text-gray-600 dark:text-gray-400 list-decimal list-inside">
              <li>Go to YouTube and find the video you want to download.</li>
              <li>Click the Share button and copy the video URL, or copy from your browser&apos;s address bar.</li>
              <li>Paste the URL into the FetchClip Pro input field above and click Fetch.</li>
              <li>Choose your preferred quality (4K, 1080p, 720p, etc.).</li>
              <li>Click Download Video or Audio Only — your browser will start downloading immediately.</li>
            </ol>

            <h2 className="text-2xl font-bold mt-10 mb-6">Download YouTube Audio (MP3)</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Want just the audio from a YouTube video? After fetching the media, click the <strong>Audio Only</strong> button.
              FetchClip Pro extracts the highest quality audio stream and delivers it directly to your browser in M4A or
              MP3 format — no re-encoding wait, no quality loss.
            </p>

            <h2 className="text-2xl font-bold mt-10 mb-6">Supported YouTube Content</h2>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400 list-disc list-inside">
              <li>Regular YouTube videos (all resolutions up to 4K)</li>
              <li>YouTube Shorts</li>
              <li>Music videos</li>
              <li>Educational content</li>
              <li>Documentary clips</li>
            </ul>
            <p className="text-sm text-gray-400 mt-4">
              Note: Private videos, age-restricted content, and live streams cannot be downloaded.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
