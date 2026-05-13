import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import DownloaderCard from '@/components/downloader/DownloaderCard';
import Link from 'next/link';

const POSTS: Record<string, {
  title: string; date: string; readTime: string; category: string;
  metaDesc: string; content: string;
}> = {
  'how-to-download-youtube-videos': {
    title: 'How to Download YouTube Videos in 2025 (Complete Guide)',
    date: '2025-01-10', readTime: '5 min read', category: 'YouTube',
    metaDesc: 'Step-by-step guide to downloading YouTube videos in any quality including 4K, 1080p, and audio extraction in 2025.',
    content: `
## The Fastest Way to Download YouTube Videos

Downloading YouTube videos for offline viewing is something millions of people do every day — for travel, saving educational content, or archiving your favorite creators' work before it disappears.

FetchClip Pro makes this **completely free and takes under 10 seconds**.

## Step-by-Step Guide

**Step 1: Copy the YouTube URL**

Open YouTube and navigate to the video you want to download. Copy the URL from your browser's address bar. It will look like: \`https://www.youtube.com/watch?v=dQw4w9WgXcQ\`

You can also share from the YouTube app on mobile: tap Share → Copy Link.

**Step 2: Paste and Fetch**

Paste the URL into FetchClip Pro's input field and click **Fetch**. Our engine extracts all available quality options in seconds.

**Step 3: Choose Your Quality**

Select from all available resolutions:
- **4K (2160p)** — Best quality, large file size
- **1080p Full HD** — Recommended for most uses
- **720p HD** — Good quality, smaller file
- **480p / 360p** — Great for mobile viewing or limited storage

**Step 4: Download**

Click **Download Video** and your browser will immediately start downloading the file. No redirects, no popups.

## Downloading YouTube Audio Only

Want just the audio? After fetching, click **Audio Only**. FetchClip Pro extracts the highest quality audio stream directly from YouTube — no re-encoding, instant delivery.

This is perfect for podcasts, music, lectures, and any content where you only need audio.

## What YouTube Content Can Be Downloaded?

✅ Regular videos (all lengths)
✅ YouTube Shorts
✅ Music videos
✅ Educational content
✅ Documentary clips

❌ Private videos
❌ Members-only content
❌ Live streams (currently broadcasting)
❌ Age-restricted content

## Tips for Best Results

- Always use the full video URL, not shortened links from comments
- For YouTube Shorts, use the share link from the app
- If a download fails, try refreshing and fetching again — CDN links can expire
    `,
  },
  'tiktok-video-download-guide': {
    title: 'Download TikTok Videos Without Watermark',
    date: '2025-01-08', readTime: '4 min read', category: 'TikTok',
    metaDesc: 'How to download TikTok videos without watermark in 2025. Works on iPhone, Android, and desktop browsers.',
    content: `
## Download TikTok Videos — The Clean Way

TikTok's built-in save feature adds a watermark to every video. FetchClip Pro fetches TikTok videos directly from their CDN, giving you the cleanest possible version.

## How to Get a TikTok Video URL

**On Mobile (iOS/Android):**
1. Open TikTok and find the video
2. Tap the Share arrow → Copy Link
3. Paste into FetchClip Pro

**On Desktop:**
1. Go to tiktok.com
2. Find the video
3. Click Share → Copy Link, or copy from the address bar

## Supported TikTok Content

- Regular TikTok videos (all lengths)
- TikTok Duets and Stitches
- Videos from any public account

Private accounts and TikTok LIVE cannot be downloaded.

## Why No Watermark?

FetchClip Pro accesses TikTok's media delivery network directly using the original video source. The watermark is overlaid in the TikTok app — the underlying video file itself is clean.
    `,
  },
  'instagram-reels-download': {
    title: 'How to Download Instagram Reels to Your Phone',
    date: '2025-01-05', readTime: '3 min read', category: 'Instagram',
    metaDesc: 'Save Instagram Reels in HD quality to your camera roll without any apps. Free, instant, no login required.',
    content: `
## Save Instagram Reels Instantly

Instagram doesn't let you save Reels from other accounts natively. FetchClip Pro gives you a fast, free alternative.

## Getting the Instagram Reel URL

**On Mobile:**
1. Open Instagram and find the Reel
2. Tap the three dots (⋯) → Copy Link
3. Paste into FetchClip Pro

**On Desktop:**
1. Open instagram.com
2. Right-click the Reel → Copy link address
OR copy from the browser address bar

## What Can Be Downloaded

✅ Instagram Reels
✅ Video posts (regular and carousel videos)
✅ IGTV videos

❌ Stories (private by nature)
❌ Content from private accounts
❌ Instagram Lives

## Getting It to Your Camera Roll

After downloading on mobile, go to your Downloads folder and move the file to your Photos app. On iPhone, use the Files app to share to Photos.
    `,
  },
  'is-it-legal-to-download-videos': {
    title: 'Is It Legal to Download Videos from Social Media?',
    date: '2025-01-02', readTime: '7 min read', category: 'General',
    metaDesc: 'An honest, balanced look at the legal considerations around downloading publicly available social media content for personal use.',
    content: `
## The Honest Answer

Downloading videos from social media exists in a **legal gray area** that varies significantly by country, platform, and intended use. Here's what you need to know.

## Personal Use vs. Commercial Use

The most important distinction is **what you do with the downloaded content**.

**Generally acceptable:**
- Downloading for personal offline viewing
- Educational or research purposes (fair use doctrine in the US)
- Archiving your own content or content you have permission to download

**Not acceptable:**
- Re-uploading content you don't own
- Using downloads for commercial purposes
- Redistributing content without permission

## Platform Terms of Service

Most social media platforms prohibit downloading through their Terms of Service. However, ToS violations are civil matters between you and the platform — not criminal law.

Platforms can ban your account if they detect ToS violations, but criminal prosecution for personal downloading of publicly available content is extremely rare.

## Copyright Law

Copyright belongs to the creator of the content, not the platform. Downloading for personal viewing generally falls under fair use in many jurisdictions.

**Key factors courts consider:**
1. Purpose (personal vs. commercial)
2. Nature of the work
3. Amount used
4. Effect on the market for the original

## Our Recommendation

- Only download publicly available content
- Use downloads for personal, offline viewing
- Never redistribute or monetize content you don't own
- Respect creators by engaging with their content on-platform when possible
- When in doubt, ask the creator for permission

FetchClip Pro is designed for legitimate personal use. We encourage all users to respect creators and copyright law.
    `,
  },
};

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS[slug];
  if (!post) return {};
  return {
    title: `${post.title} — FetchClip Pro Blog`,
    description: post.metaDesc,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { title: post.title, description: post.metaDesc, type: 'article' },
  };
}

export function generateStaticParams() {
  return Object.keys(POSTS).map(slug => ({ slug }));
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = POSTS[slug];
  if (!post) notFound();

  const sections = post.content.trim().split('\n\n');

  function renderContent(text: string, i: number) {
    const t = text.trim();
    if (t.startsWith('## ')) {
      return <h2 key={i} className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-gray-100">{t.slice(3)}</h2>;
    }
    if (t.startsWith('**') && t.endsWith('**')) {
      return <h3 key={i} className="text-lg font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">{t.slice(2, -2)}</h3>;
    }
    if (t.startsWith('- ') || t.startsWith('✅') || t.startsWith('❌')) {
      const items = t.split('\n');
      return (
        <ul key={i} className="space-y-1.5 my-3">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              <span className="flex-shrink-0 mt-0.5">{item.startsWith('- ') ? '•' : ''}</span>
              <span dangerouslySetInnerHTML={{ __html: item.replace(/^[-✅❌]\s?/, '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm my-3"
        dangerouslySetInnerHTML={{ __html: t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">$1</code>') }}
      />
    );
  }

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-center gap-2">
            <Link href="/blog" className="text-sm text-brand-500 hover:underline">← Blog</Link>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span className="platform-badge">{post.category}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100 leading-tight">{post.title}</h1>

          <div className="flex items-center gap-4 text-sm text-gray-400 mb-10">
            <span>{new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            <span>{post.readTime}</span>
          </div>

          <div className="glass-card p-8 mb-10">
            {sections.map((section, i) => renderContent(section, i))}
          </div>

          <div className="glass-card p-8">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Try It Now</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Paste any supported URL below to download instantly.</p>
            <DownloaderCard />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
