'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  Download, Loader2, Music, Image as ImageIcon, Play,
  Clock, Eye, User, X, ChevronDown, AlertCircle,
} from 'lucide-react';
import {
  fetchMediaMetadata,
  requestDownload,
  logEvent,
  formatDuration,
  formatFileSize,
  platformDisplayName,
  platformColor,
  type MediaMetadata,
  type MediaFormat,
} from '@/lib/api';

type DownloadState = 'idle' | 'fetching' | 'ready' | 'error';

// ─── Download helpers ────────────────────────────────────────────────────────

/**
 * PRIMARY download method: fetch the file as a Blob, then trigger save.
 * This avoids the "opens in new tab" problem caused by cross-origin redirects.
 * Works when the CDN allows CORS (most do for direct stream URLs).
 */
async function downloadAsBlob(url: string, filename: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      // No credentials — CDN URLs are pre-signed, don't need cookies
    });
    if (!response.ok) return false;

    const blob    = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a      = document.createElement('a');
    a.href       = blobUrl;
    a.download   = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    }, 3000);

    return true;
  } catch {
    return false;
  }
}

/**
 * FALLBACK download method: plain anchor with download attribute and target=_self.
 * Less reliable for cross-origin URLs but better than opening a new tab.
 */
function downloadViaAnchor(url: string, filename: string) {
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = filename;
  a.target     = '_self';   // _self prevents new tab
  a.rel        = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 3000);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function DownloaderCard({ defaultUrl = '' }: { defaultUrl?: string }) {
  const [url,            setUrl]            = useState(defaultUrl);
  const [state,          setState]          = useState<DownloadState>('idle');
  const [metadata,       setMetadata]       = useState<MediaMetadata | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<MediaFormat | null>(null);
  const [errorMsg,       setErrorMsg]       = useState('');
  const [activeDownload, setActiveDownload] = useState<'video' | 'audio' | 'thumbnail' | null>(null);
  const [thumbError,     setThumbError]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Reset ──────────────────────────────────────────────────────────────
  function reset() {
    setMetadata(null);
    setSelectedFormat(null);
    setErrorMsg('');
    setState('idle');
    setActiveDownload(null);
    setThumbError(false);
    setUrl('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Fetch ──────────────────────────────────────────────────────────────
  async function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setState('fetching');
    setErrorMsg('');
    setMetadata(null);
    setSelectedFormat(null);
    setThumbError(false);

    const result = await fetchMediaMetadata(trimmed);

    if (!result.success || !result.data) {
      setErrorMsg(result.error || 'Failed to fetch media. Please check the URL and try again.');
      setState('error');
      return;
    }

    const data = result.data;
    setMetadata(data);

    // Pick best default video format (prefer ≤1080p with real URL)
    const defaultFmt =
      data.formats.find(f => f.type === 'video' && f.height !== null && f.height <= 1080 && f.url) ||
      data.formats.find(f => f.type === 'video' && f.url) ||
      data.formats.find(f => f.type === 'video') ||
      null;

    setSelectedFormat(defaultFmt);
    setState('ready');
    logEvent('fetch_success', data.platform, { title: data.title });
  }

  // ── Download ───────────────────────────────────────────────────────────
  async function handleDownload(type: 'video' | 'audio' | 'thumbnail') {
    if (!metadata || activeDownload !== null) return;

    setActiveDownload(type);

    try {
      // For audio: always pass undefined as formatId — backend will use bestaudio selector.
      // For video: pass the selected format's ID.
      // Never pass the sentinel 'bestaudio' formatId from frontend — let backend handle it.
      const formatId =
        type === 'audio' ? undefined
        : type === 'video' ? (selectedFormat?.formatId && selectedFormat.formatId !== 'bestaudio'
            ? selectedFormat.formatId
            : undefined)
        : undefined;

      const result = await requestDownload(metadata.webpage_url, formatId, type);

      if (!result.success || !result.directUrl) {
        toast.error(result.error || 'Download failed. Please try again.');
        return;
      }

      const filename = result.filename || `fetchclip-${type}.${result.ext || 'mp4'}`;

      // Try blob download first (no new tab), fallback to anchor
      const blobOk = await downloadAsBlob(result.directUrl, filename);
      if (!blobOk) {
        downloadViaAnchor(result.directUrl, filename);
      }

      // Show success ONLY after download actually started
      toast.success(
        type === 'audio'     ? '🎵 Audio download started!'
        : type === 'thumbnail' ? '🖼️ Thumbnail download started!'
        : '📥 Video download started!'
      );

      logEvent('download_success', metadata.platform, { type, quality: selectedFormat?.quality });

    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setActiveDownload(null);
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────

  // VIDEO FORMATS: all formats marked type='video'
  const videoFormats = metadata?.formats.filter(f => f.type === 'video') ?? [];

  /**
   * FIX FOR "Video button disappears":
   * Old code: {videoFormats.length > 0 && <button>Download Video</button>}
   * This hid the button when normalizeFormats returned 0 video formats.
   *
   * New approach: Show video button if:
   *   1. There are explicit video formats (normal case), OR
   *   2. metadata.hasVideo is true (set by backend even if format list is oddly structured)
   */
  const showVideoButton = videoFormats.length > 0 || (metadata?.hasVideo ?? false);

  /**
   * FIX FOR "Audio button incorrectly disabled":
   * Old code only checked: metadata?.formats.some(f => f.type === 'audio') || metadata?.hasAudio
   * The synthetic 'bestaudio' entry has type='audio' so this SHOULD work,
   * but hasAudio from backend was sometimes false for Instagram.
   *
   * New approach: Show audio button if ANY of these are true:
   *   1. Explicit audio-type format exists (real or synthetic)
   *   2. metadata.hasAudio is true
   *   3. Any video format has embedded audio (acodec != null/none)
   *   4. Platform is known to always have audio
   */
  const hasAudioFormat  = metadata?.formats.some(f => f.type === 'audio') ?? false;
  const hasEmbeddedAudio = metadata?.formats.some(
    f => f.type === 'video' && f.acodec && f.acodec !== 'none'
  ) ?? false;
  const knownAudioPlatform = metadata?.platform
    ? ['instagram','tiktok','facebook','twitter','pinterest','vimeo','reddit'].includes(metadata.platform)
    : false;

  const showAudioButton = hasAudioFormat || hasEmbeddedAudio || knownAudioPlatform || (metadata?.hasAudio ?? false);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-3xl mx-auto">

      {/* URL input */}
      <div className="glass-card p-2 shadow-xl shadow-gray-200/50 dark:shadow-gray-900/50">
        <form onSubmit={handleFetch} className="flex gap-2">
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste Instagram, TikTok, Facebook, Twitter/X or Pinterest URL…"
            className="input-field flex-1 text-sm"
            disabled={state === 'fetching'}
            autoFocus
          />
          {metadata && (
            <button
              type="button"
              onClick={reset}
              className="p-3 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              aria-label="Clear"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <button
            type="submit"
            disabled={state === 'fetching' || !url.trim()}
            className="btn-primary flex items-center gap-2 px-6 whitespace-nowrap"
          >
            {state === 'fetching'
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Fetching…</>
              : <><Download className="w-4 h-4" /> Fetch</>
            }
          </button>
        </form>
      </div>

      {/* Error */}
      {state === 'error' && (
        <div className="mt-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Unable to fetch media</p>
            <p className="text-sm text-red-600 dark:text-red-500 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {state === 'fetching' && (
        <div className="mt-6 glass-card p-6">
          <div className="flex gap-4">
            <div className="w-40 h-24 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse flex-shrink-0 flex items-center justify-center">
              <Play className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            </div>
            <div className="flex-1 space-y-3 pt-1">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/4" />
            </div>
          </div>
        </div>
      )}

      {/* Media card */}
      {state === 'ready' && metadata && (
        <div className="mt-6 glass-card overflow-hidden animate-slide-up shadow-xl shadow-gray-200/50 dark:shadow-gray-900/50">

          {/* Info header */}
          <div className="p-6 flex flex-col sm:flex-row gap-5">

            {/* Thumbnail — use plain <img>, NOT Next.js <Image>
                Next Image requires domain allow-listing; plain img handles any URL */}
            <div className="relative flex-shrink-0 w-full sm:w-48 aspect-video rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 group">
              {metadata.thumbnail && !thumbError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={metadata.thumbnail}
                  alt={metadata.title}
                  className="w-full h-full object-cover"
                  onError={() => setThumbError(true)}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-100 to-accent-100 dark:from-brand-900/30 dark:to-accent-900/30">
                  <Play className="w-12 h-12 text-brand-400" />
                </div>
              )}
              {metadata.duration && (
                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded-md font-mono">
                  {formatDuration(metadata.duration)}
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`platform-badge ${platformColor(metadata.platform)}`}>
                  {platformDisplayName(metadata.platform)}
                </span>
                {showAudioButton && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                    <Music className="w-3 h-3" /> Audio Available
                  </span>
                )}
              </div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight line-clamp-2 mb-3">
                {metadata.title}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                {metadata.uploader && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />{metadata.uploader}
                  </span>
                )}
                {metadata.duration && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />{formatDuration(metadata.duration)}
                  </span>
                )}
                {metadata.viewCount && (
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />{metadata.viewCount.toLocaleString()} views
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="px-6 pb-6 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-5">

            {/* Quality selector — only when video formats exist */}
            {videoFormats.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                  Select Quality
                </label>
                <div className="relative">
                  <select
                    value={selectedFormat?.formatId || ''}
                    onChange={e => {
                      const fmt = metadata.formats.find(f => f.formatId === e.target.value);
                      setSelectedFormat(fmt ?? null);
                    }}
                    className="input-field appearance-none pr-10 cursor-pointer text-sm"
                    disabled={activeDownload !== null}
                  >
                    {videoFormats.map(f => (
                      <option key={f.formatId} value={f.formatId}>
                        {f.quality}
                        {f.ext      ? ` · ${f.ext.toUpperCase()}` : ''}
                        {f.filesize ? ` · ${formatFileSize(f.filesize)}` : ''}
                        {f.fps && f.fps > 30 ? ` · ${f.fps}fps` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Download buttons */}
            <div className="flex flex-wrap gap-3">

              {/* ── Video button ────────────────────────────────────────────
                  FIX: Was hidden when videoFormats.length === 0.
                  Now shows whenever showVideoButton is true (includes hasVideo flag).
              */}
              {showVideoButton && (
                <button
                  onClick={() => handleDownload('video')}
                  disabled={activeDownload !== null}
                  className="btn-primary flex items-center gap-2 flex-1 sm:flex-none justify-center min-w-[160px]"
                >
                  {activeDownload === 'video'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Downloading…</>
                    : <><Download className="w-4 h-4" /> Download Video</>
                  }
                </button>
              )}

              {/* ── Audio button ────────────────────────────────────────────
                  FIX: Was disabled/hidden when hasAudio was false for Instagram.
                  Now shown whenever showAudioButton is true (checks 4 conditions).
                  On click: passes type='audio' and NO formatId → backend uses bestaudio selector.
              */}
              {showAudioButton && (
                <button
                  onClick={() => handleDownload('audio')}
                  disabled={activeDownload !== null}
                  className="btn-secondary flex items-center gap-2 justify-center min-w-[130px]"
                >
                  {activeDownload === 'audio'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Downloading…</>
                    : <><Music className="w-4 h-4" /> Audio Only</>
                  }
                </button>
              )}

              {/* ── Thumbnail button ─────────────────────────────────────── */}
              {metadata.thumbnail && (
                <button
                  onClick={() => handleDownload('thumbnail')}
                  disabled={activeDownload !== null}
                  className="btn-secondary flex items-center gap-2 justify-center"
                >
                  {activeDownload === 'thumbnail'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Downloading…</>
                    : <><ImageIcon className="w-4 h-4" /> Thumbnail</>
                  }
                </button>
              )}
            </div>

            {/* Progress indicator */}
            {activeDownload && (
              <p className="text-xs text-brand-500 dark:text-brand-400 flex items-center gap-1.5 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                Preparing {activeDownload}… please wait.
              </p>
            )}

            <p className="text-xs text-gray-400 dark:text-gray-500">
              By downloading, you confirm this content is publicly available and you have the right to download it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}