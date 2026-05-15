'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  Download, Loader2, Music, Image as ImageIcon, Play,
  Clock, Eye, User, X, ChevronDown, AlertCircle
} from 'lucide-react';
import {
  fetchMediaMetadata, requestDownload,
  logEvent, formatDuration, formatFileSize, platformDisplayName,
  platformColor, type MediaMetadata, type MediaFormat,
} from '@/lib/api';

type DownloadState = 'idle' | 'fetching' | 'ready' | 'error';

export default function DownloaderCard({ defaultUrl = '' }: { defaultUrl?: string }) {
  const [url, setUrl] = useState(defaultUrl);
  const [state, setState] = useState<DownloadState>('idle');
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<MediaFormat | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeDownload, setActiveDownload] = useState<'video' | 'audio' | 'thumbnail' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setMetadata(null);
    setSelectedFormat(null);
    setErrorMsg('');
    setState('idle');
    setActiveDownload(null);
    setUrl('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setState('fetching');
    setErrorMsg('');
    setMetadata(null);
    setSelectedFormat(null);

    const result = await fetchMediaMetadata(trimmed);

    if (!result.success || !result.data) {
      setErrorMsg(result.error || 'Failed to fetch media. Please check the URL and try again.');
      setState('error');
      return;
    }

    const data = result.data;
    setMetadata(data);

    const defaultFmt =
      data.formats.find(f => f.type === 'video' && f.height !== null && f.height <= 1080) ||
      data.formats.find(f => f.type === 'video') ||
      null;
    setSelectedFormat(defaultFmt);
    setState('ready');

    logEvent('fetch_success', data.platform, { title: data.title });
  }

  // FIXED: Real download using fetch + blob — forces Chrome download bar, never opens new page
  async function triggerRealDownload(directUrl: string, filename: string) {
    try {
      // Try fetch + blob first (works for same-origin or CORS-enabled CDNs)
      const response = await fetch(directUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('fetch failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      // Fallback: use download attribute trick via hidden iframe
      // This prevents opening a new tab while still triggering download
      const a = document.createElement('a');
      a.href = directUrl;
      a.download = filename;
      a.target = '_self'; // KEY: _self not _blank prevents new tab
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  async function handleDownload(type: 'video' | 'audio' | 'thumbnail') {
    if (!metadata || activeDownload !== null) return;

    setActiveDownload(type);

    try {
      if (type === 'thumbnail' && metadata.thumbnail) {
        // For thumbnail: fetch via our backend proxy to avoid CORS
        const result = await requestDownload(metadata.webpage_url, undefined, 'thumbnail');
        setActiveDownload(null);
        if (!result.success || !result.directUrl) {
          toast.error(result.error || 'Thumbnail download failed.');
          return;
        }
        await triggerRealDownload(result.directUrl, result.filename || 'thumbnail.jpg');
        toast.success('Thumbnail downloading...');
        logEvent('download_success', metadata.platform, { type: 'thumbnail' });
        return;
      }

      const formatId = type === 'video' ? (selectedFormat?.formatId || undefined) : undefined;
      const result = await requestDownload(metadata.webpage_url, formatId, type);

      setActiveDownload(null);

      if (!result.success || !result.directUrl) {
        toast.error(result.error || 'Download failed. Please try again.');
        return;
      }

      const filename = result.filename || `fetchclip-${type}.${result.ext || (type === 'audio' ? 'm4a' : 'mp4')}`;
      
      // Trigger real download — shows in Chrome download bar
      await triggerRealDownload(result.directUrl, filename);
      
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} download started in Chrome!`);
      logEvent('download_success', metadata.platform, { type, quality: selectedFormat?.quality });

    } catch (err) {
      setActiveDownload(null);
      toast.error('Download failed. Please try again.');
    }
  }

  const videoFormats = metadata?.formats.filter(f => f.type === 'video') ?? [];
  
  // FIXED: Audio always enabled if there's any media (all videos have audio)
  const showAudioButton = metadata !== null; // Always show audio button when media is loaded

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* URL Input */}
      <div className="glass-card p-2 shadow-xl shadow-gray-200/50 dark:shadow-gray-900/50">
        <form onSubmit={handleFetch} className="flex gap-2">
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste TikTok, Instagram, Facebook, Twitter or Pinterest URL..."
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
            {state === 'fetching' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Fetching...</>
            ) : (
              <><Download className="w-4 h-4" /> Fetch</>
            )}
          </button>
        </form>
      </div>

      {/* Error state */}
      {state === 'error' && (
        <div className="mt-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to fetch media</p>
            <p className="text-sm text-red-600 dark:text-red-500 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {state === 'fetching' && (
        <div className="mt-6 glass-card p-6 animate-pulse">
          <div className="flex gap-4">
            <div className="w-40 h-24 bg-gray-200 dark:bg-gray-700 rounded-xl shimmer flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded shimmer w-3/4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded shimmer w-1/2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded shimmer w-1/4" />
            </div>
          </div>
        </div>
      )}

      {/* Media preview + download UI */}
      {state === 'ready' && metadata && (
        <div className="mt-6 glass-card overflow-hidden animate-slide-up shadow-xl shadow-gray-200/50 dark:shadow-gray-900/50">
          {/* Media info header */}
          <div className="p-6 flex flex-col sm:flex-row gap-5">
            {metadata.thumbnail && (
              <div className="relative flex-shrink-0 w-full sm:w-48 aspect-video rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 group">
                {/* FIXED: Use regular img tag instead of next/image to avoid CORS/domain issues */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={metadata.thumbnail}
                  alt={metadata.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // If thumbnail fails, show placeholder
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                  crossOrigin="anonymous"
                />
                {metadata.duration && (
                  <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded-md font-mono">
                    {formatDuration(metadata.duration)}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play className="w-10 h-10 text-white drop-shadow-lg" />
                </div>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className={`platform-badge ${platformColor(metadata.platform)}`}>
                  {platformDisplayName(metadata.platform)}
                </span>
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

          {/* Format selector + Download buttons */}
          <div className="px-6 pb-6 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-5">
            {/* Quality selector */}
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
                      setSelectedFormat(fmt || null);
                    }}
                    className="input-field appearance-none pr-10 cursor-pointer text-sm"
                    disabled={activeDownload !== null}
                  >
                    {videoFormats.map(f => (
                      <option key={f.formatId} value={f.formatId}>
                        {f.quality}
                        {f.ext ? ` · ${f.ext.toUpperCase()}` : ''}
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
              {/* Video download button */}
              {videoFormats.length > 0 && (
                <button
                  onClick={() => handleDownload('video')}
                  disabled={activeDownload !== null}
                  className="btn-primary flex items-center gap-2 flex-1 sm:flex-none justify-center"
                >
                  {activeDownload === 'video' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</>
                  ) : (
                    <><Download className="w-4 h-4" /> Download Video</>
                  )}
                </button>
              )}

              {/* FIXED: Audio button — always shown when media loaded, never disabled by default */}
              {showAudioButton && (
                <button
                  onClick={() => handleDownload('audio')}
                  disabled={activeDownload !== null}
                  className="btn-secondary flex items-center gap-2 justify-center"
                >
                  {activeDownload === 'audio' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</>
                  ) : (
                    <><Music className="w-4 h-4" /> Audio Only</>
                  )}
                </button>
              )}

              {/* Thumbnail download button */}
              {metadata.thumbnail && (
                <button
                  onClick={() => handleDownload('thumbnail')}
                  disabled={activeDownload !== null}
                  className="btn-secondary flex items-center gap-2 justify-center"
                >
                  {activeDownload === 'thumbnail' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</>
                  ) : (
                    <><ImageIcon className="w-4 h-4" /> Thumbnail</>
                  )}
                </button>
              )}
            </div>

            {activeDownload && (
              <p className="text-xs text-brand-500 animate-pulse flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Getting download link... this may take a few seconds
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