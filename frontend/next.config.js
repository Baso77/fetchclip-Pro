/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Allow any remote image — needed for thumbnails from various CDNs
    remotePatterns: [
      { protocol: 'https', hostname: '**' }, // allow all HTTPS image sources
    ],
    // Use unoptimized to avoid Next.js processing issues with external CDN images
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // YouTube redirect to coming soon notice
      { source: '/tools/youtube-downloader', destination: '/?youtube=soon', permanent: false },
    ];
  },
};

module.exports = nextConfig;