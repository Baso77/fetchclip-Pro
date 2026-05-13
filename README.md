# FetchClip Pro

Production-grade video downloader SaaS platform. Download from YouTube, TikTok, Instagram, Facebook, Twitter/X and Pinterest.

## Architecture

```
fetchclip-pro/
├── frontend/          Next.js 15 + TypeScript + Tailwind → Vercel
├── backend/           Node.js + Express + yt-dlp → Railway
└── database/          Supabase PostgreSQL
```

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- yt-dlp installed (`pip install yt-dlp` or `brew install yt-dlp`)
- ffmpeg installed (`brew install ffmpeg` or apt)

### 1. Clone and install

```bash
# Backend
cd backend
npm install
cp .env.example .env
# Fill in .env values

# Frontend
cd ../frontend
npm install
cp .env.example .env.local
# Fill in .env.local values
```

### 2. Database setup

1. Create a Supabase project at https://supabase.com
2. Go to SQL Editor and run `database/schema.sql`
3. Copy your project URL and service role key to backend `.env`

### 3. Start development servers

```bash
# Terminal 1 — Backend
cd backend
npm run dev
# → http://localhost:3001

# Terminal 2 — Frontend
cd frontend
npm run dev
# → http://localhost:3000
```

### 4. Verify everything works

```bash
# Health check
curl http://localhost:3001/api/health

# Test fetch
curl -X POST http://localhost:3001/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

---

## Production Deployment

### Backend → Railway

1. Create account at https://railway.app
2. New Project → Deploy from GitHub → select `backend/` directory
3. Add environment variables in Railway dashboard:

```
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://your-app.vercel.app
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
ADMIN_SECRET_KEY=random-secret-key-here
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=30
CACHE_TTL=300
```

4. Railway will auto-detect `nixpacks.toml` and install yt-dlp + ffmpeg
5. Note your Railway backend URL (e.g. `https://fetchclip-backend.up.railway.app`)

### Frontend → Vercel

1. Create account at https://vercel.com
2. New Project → Import from GitHub → select `frontend/` directory
3. Add environment variables:

```
NEXT_PUBLIC_BACKEND_URL=https://fetchclip-backend.up.railway.app
NEXT_PUBLIC_SITE_URL=https://your-domain.com
ADMIN_SECRET_KEY=same-random-secret-key-as-backend
```

4. Deploy!

### Custom Domain

1. Add your domain in Vercel project settings
2. Update DNS records as instructed
3. Update `NEXT_PUBLIC_SITE_URL` and `FRONTEND_URL` (backend) to your domain

---

## API Reference

### POST /api/fetch
Fetch metadata for a media URL.

**Request:**
```json
{ "url": "https://www.youtube.com/watch?v=..." }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "platform": "youtube",
    "title": "Video Title",
    "thumbnail": "https://...",
    "duration": 212,
    "uploader": "Channel Name",
    "formats": [
      { "formatId": "137", "quality": "1080p", "ext": "mp4", "filesize": 52428800, "type": "video" },
      { "formatId": "140", "quality": "Audio Only", "ext": "m4a", "type": "audio" }
    ]
  }
}
```

### POST /api/download
Get a direct download URL.

**Request:**
```json
{ "url": "https://...", "formatId": "137", "type": "video" }
```

**Response:**
```json
{
  "success": true,
  "directUrl": "https://cdn.example.com/...",
  "filename": "Video Title.mp4",
  "ext": "mp4"
}
```

### GET /api/health
Backend health check.

### POST /api/contact
Contact form submission.

### GET /api/trending
Trending downloads list.

### GET /api/admin/stats
Admin stats (requires `x-admin-key` header).

---

## Security

- All inputs validated with Zod
- Rate limiting: 15 req/min on fetch/download, 30 req/min general
- CORS restricted to FRONTEND_URL
- Helmet security headers
- IP hashing (not storing raw IPs)
- Admin routes require secret key header
- No media files stored on backend servers

## Scaling

For 10,000+ daily users:
1. Enable Supabase connection pooling (PgBouncer)
2. Upgrade Railway plan for more CPU
3. Add Redis for distributed rate limiting (replace node-cache)
4. Consider a CDN proxy for thumbnail images
5. Add a download queue with Bull/BullMQ for high concurrency
