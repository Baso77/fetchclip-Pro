'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import {
  Download, Loader2, Music, Image as ImageIcon, Play,
  Clock, Eye, User, X, ChevronDown, AlertCircle
} from 'lucide-react';
import {
  fetchMediaMetadata, requestDownload, triggerBrowserDownload,
  logEvent, formatDuration, formatFileSize, platformDisplayName,
  platformColor, type MediaMetadata, type MediaFormat,
} from '@/lib/api';

type DownloadState = 'idle' | 'fetching' | 'ready' | 'downloading' | 'error';

export default function DownloaderCard({ defaultUrl = '' }: { defaultUrl?: string }) {
  const [url, setUrl] = useState(defaultUrl);
  const [state, setState] = useState<DownloadState>('idle');
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<MediaFormat | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setMetadata(null);
    setSelectedFormat(null);
    setErrorMsg('');
    setState('idle');
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

    const result = await fetchMediaMetadata(trimmed);

    if (!result.success || !result.data) {
      setErrorMsg(result.error || 'Failed to fetch media. Please check the URL and try again.');
      setState('error');
      return;
    }

    const data = result.data;
    setMetadata(data);

    const defaultFmt = data.formats.find(f => f.type === 'video' && f.height && f.height <= 1080)
      || data.formats[0]
      || null;
    setSelectedFormat(defaultFmt);
    setState('ready');

    logEvent('fetch_success', data.platform, { title: data.title });
  }

  async function handleDownload(type: 'video' | 'audio' | 'thumbnail') {
    if (!metadata) return;
    const id = type === 'audio'
      ? 'audio-best'
      : `${type}-${selectedFormat?.formatId || 'best'}`;
    setDownloadingId(id);

    const formatId = type === 'video' ? (selectedFormat?.formatId || undefined) : undefined;
    const result = await requestDownload(metadata.webpage_url, formatId, type);

    setDownloadingId(null);

    if (!result.success || !result.directUrl) {
      toast.error(result.error || 'Download failed. Please try again.');
      return;
    }

    triggerBrowserDownload(result.directUrl, result.filename || `fetchclip-${type}.${result.ext || 'mp4'}`);
    toast.success(`Starting ${type} download...`);
    logEvent('download_success', metadata.platform, { type, quality: selectedFormat?.quality });
  }

  const videoFormats = metadata?.formats.filter(f => f.type === 'video') || [];
  const audioFormats = metadata?.formats.filter(f => f.type === 'audio') || [];
  const canDownloadAudio = metadata?.hasAudio || audioFormats.length > 0;

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
            placeholder="Paste YouTube, TikTok, Instagram, Facebook, Twitter or Pinterest URL..."
            className="input-field flex-1 text-sm"
            disabled={state === 'fetching'}
            autoFocus
          />
          {metadata && (
            <button type="button" onClick={reset}
              className="p-3 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              aria-label="Clear">
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
            {/* Thumbnail */}
            {metadata.thumbnail && (
              <div className="relative flex-shrink-0 w-full sm:w-48 aspect-video rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 group">
                <Image
                  src={metadata.thumbnail}
                  alt={metadata.title}
                  fill
                  className="object-cover"
                  unoptimized
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

            {/* Meta */}
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
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{metadata.uploader}</span>
                )}
                {metadata.duration && (
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(metadata.duration)}</span>
                )}
                {metadata.viewCount && (
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{metadata.viewCount.toLocaleString()} views</span>
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
                  >
                    {videoFormats.map(f => (
                      <option key={f.formatId} value={f.formatId}>
                        {f.quality} {f.ext ? `· ${f.ext.toUpperCase()}` : ''} {f.filesize ? `· ${formatFileSize(f.filesize)}` : ''}
                        {f.fps ? ` · ${f.fps}fps` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Download buttons */}
            <div className="flex flex-wrap gap-3">
              {/* Video download */}
              {videoFormats.length > 0 && (
                <button
                  onClick={() => handleDownload('video')}
                  disabled={downloadingId !== null}
                  className="btn-primary flex items-center gap-2 flex-1 sm:flex-none justify-center"
                >
                  {downloadingId === `video-${selectedFormat?.formatId || 'best'}` ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</>
                  ) : (
                    <><Download className="w-4 h-4" /> Download Video</>
                  )}
                </button>
              )}

              {/* Audio download */}
              {canDownloadAudio && (
                <button
                  onClick={() => handleDownload('audio')}
                  disabled={downloadingId !== null}
                  className="btn-secondary flex items-center gap-2 justify-center"
                >
                  {downloadingId === 'audio-best' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</>
                  ) : (
                    <><Music className="w-4 h-4" /> Audio Only</>
                  )}
                </button>
              )}

              {/* Thumbnail download */}
              {metadata.thumbnail && (
                <button
                  onClick={() => handleDownload('thumbnail')}
                  disabled={downloadingId !== null}
                  className="btn-secondary flex items-center gap-2 justify-center"
                >
                  {downloadingId === 'thumbnail-best' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</>
                  ) : (
                    <><ImageIcon className="w-4 h-4" /> Thumbnail</>
                  )}
                </button>
              )}
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">
              By downloading, you confirm this content is publicly available and you have the right to download it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
