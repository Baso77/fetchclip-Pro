-- FetchClip Pro — Complete Supabase SQL Schema
-- Run this in the Supabase SQL editor

-- ============================================================
-- DOWNLOADS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS downloads (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url         TEXT,
  platform    TEXT NOT NULL DEFAULT 'unknown',
  title       TEXT,
  quality     TEXT,
  type        TEXT DEFAULT 'video',
  ip_hash     TEXT,
  user_agent  TEXT,
  success     BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_downloads_platform ON downloads(platform);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_downloads_success ON downloads(success);

-- ============================================================
-- ANALYTICS EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event       TEXT NOT NULL,
  platform    TEXT,
  metadata    JSONB DEFAULT '{}',
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event);
CREATE INDEX IF NOT EXISTS idx_analytics_platform ON analytics_events(platform);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at DESC);

-- ============================================================
-- CACHED MEDIA TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS cached_media (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url_hash    TEXT UNIQUE NOT NULL,
  url         TEXT NOT NULL,
  platform    TEXT,
  title       TEXT,
  thumbnail   TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cached_media_url_hash ON cached_media(url_hash);
CREATE INDEX IF NOT EXISTS idx_cached_media_expires_at ON cached_media(expires_at);

-- Auto-cleanup expired cache entries (runs via pg_cron if enabled, else manual)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM cached_media WHERE expires_at < NOW();
$$;

-- ============================================================
-- CONTACT MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_messages (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  message     TEXT NOT NULL,
  ip_hash     TEXT,
  read        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_created_at ON contact_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_read ON contact_messages(read);

-- ============================================================
-- TRENDING DOWNLOADS VIEW/TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS trending_downloads (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform        TEXT NOT NULL,
  title           TEXT NOT NULL,
  thumbnail       TEXT,
  download_count  INTEGER DEFAULT 1,
  url_hash        TEXT UNIQUE,
  last_downloaded TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trending_count ON trending_downloads(download_count DESC);
CREATE INDEX IF NOT EXISTS idx_trending_platform ON trending_downloads(platform);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cached_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE trending_downloads ENABLE ROW LEVEL SECURITY;

-- Service role (backend) has full access — no policies needed for service role
-- Anon role has NO access — all operations go through backend with service key

-- Allow public read on trending (for frontend display)
CREATE POLICY "Trending public read" ON trending_downloads
  FOR SELECT TO anon USING (true);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Daily download stats function for admin
CREATE OR REPLACE FUNCTION get_daily_stats(days_back INTEGER DEFAULT 7)
RETURNS TABLE(
  date DATE,
  total_downloads BIGINT,
  successful BIGINT,
  failed BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT
    DATE(created_at) as date,
    COUNT(*) as total_downloads,
    COUNT(*) FILTER (WHERE success = true) as successful,
    COUNT(*) FILTER (WHERE success = false) as failed
  FROM downloads
  WHERE created_at >= NOW() - (days_back || ' days')::INTERVAL
  GROUP BY DATE(created_at)
  ORDER BY date DESC;
$$;
