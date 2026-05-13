const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../utils/logger');

let supabase = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: { persistSession: false },
        global: { headers: { 'x-application-name': 'fetchclip-pro-backend' } },
      }
    );
  }
  return supabase;
}

async function logDownload({ url, platform, title, quality, type, ip, userAgent, success, error }) {
  try {
    const db = getSupabase();
    const { error: dbError } = await db.from('downloads').insert({
      url: url?.slice(0, 2048),
      platform,
      title: title?.slice(0, 500),
      quality,
      type,
      ip_hash: ip ? hashIp(ip) : null,
      user_agent: userAgent?.slice(0, 300),
      success: success ?? true,
      error_message: error?.slice(0, 500),
      created_at: new Date().toISOString(),
    });
    if (dbError) logger.warn(`DB log error: ${dbError.message}`);
  } catch (err) {
    logger.warn(`Failed to log download: ${err.message}`);
  }
}

async function logAnalyticsEvent({ event, platform, metadata, ip }) {
  try {
    const db = getSupabase();
    await db.from('analytics_events').insert({
      event,
      platform,
      metadata: metadata || {},
      ip_hash: ip ? hashIp(ip) : null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`Failed to log analytics event: ${err.message}`);
  }
}

async function cacheMedia(url, data) {
  try {
    const db = getSupabase();
    await db.from('cached_media').upsert({
      url_hash: hashUrl(url),
      url: url.slice(0, 2048),
      platform: data.platform,
      title: data.title?.slice(0, 500),
      thumbnail: data.thumbnail?.slice(0, 1000),
      metadata: data,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    }, { onConflict: 'url_hash' });
  } catch (err) {
    logger.warn(`Failed to cache media: ${err.message}`);
  }
}

async function getCachedMedia(url) {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from('cached_media')
      .select('*')
      .eq('url_hash', hashUrl(url))
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;
    return data.metadata;
  } catch {
    return null;
  }
}

async function getTrendingDownloads(limit = 10) {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from('trending_downloads')
      .select('*')
      .order('download_count', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (err) {
    logger.warn(`Failed to get trending: ${err.message}`);
    return [];
  }
}

async function saveContactMessage({ name, email, message, ip }) {
  const db = getSupabase();
  const { error } = await db.from('contact_messages').insert({
    name: name.slice(0, 200),
    email: email.slice(0, 200),
    message: message.slice(0, 2000),
    ip_hash: ip ? hashIp(ip) : null,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function getAdminStats() {
  const db = getSupabase();

  const [totalResult, platformResult, failedResult, recentResult] = await Promise.allSettled([
    db.from('downloads').select('id', { count: 'exact', head: true }),
    db.from('downloads').select('platform').eq('success', true),
    db.from('downloads').select('id', { count: 'exact', head: true }).eq('success', false),
    db.from('downloads').select('*').order('created_at', { ascending: false }).limit(20),
  ]);

  const total = totalResult.status === 'fulfilled' ? totalResult.value.count : 0;
  const failed = failedResult.status === 'fulfilled' ? failedResult.value.count : 0;

  const platformCounts = {};
  if (platformResult.status === 'fulfilled' && platformResult.value.data) {
    for (const row of platformResult.value.data) {
      platformCounts[row.platform] = (platformCounts[row.platform] || 0) + 1;
    }
  }

  const recent = recentResult.status === 'fulfilled' ? recentResult.value.data || [] : [];

  return { total, failed, platformCounts, recent };
}

function hashIp(ip) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(ip + 'fetchclip-salt').digest('hex').slice(0, 16);
}

function hashUrl(url) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(url).digest('hex');
}

module.exports = {
  getSupabase,
  logDownload,
  logAnalyticsEvent,
  cacheMedia,
  getCachedMedia,
  getTrendingDownloads,
  saveContactMessage,
  getAdminStats,
};
