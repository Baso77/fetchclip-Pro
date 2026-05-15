const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://fetchclip-backend.onrender.com';

export interface MediaFormat {
  formatId: string;
  quality: string;
  height: number | null;
  width: number | null;
  ext: string;
  filesize: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  url: string;
  type: 'video' | 'audio';
  hasAudio?: boolean;
  needsMerge?: boolean;
}

export interface MediaMetadata {
  id: string | null;
  platform: string;
  title: string;
  description: string;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  uploaderUrl: string | null;
  viewCount: number | null;
  likeCount: number | null;
  uploadDate: string | null;
  webpage_url: string;
  formats: MediaFormat[];
  hasAudio: boolean;
  hasVideo: boolean;
  extractedAt: number;
}

export interface FetchResult {
  success: boolean;
  data?: MediaMetadata;
  error?: string;
  code?: string;
}

export interface DownloadResult {
  success: boolean;
  directUrl?: string;
  filename?: string;
  ext?: string;
  type?: string;
  error?: string;
  code?: string;
}

async function apiRequest<T>(path: string, options: RequestInit, timeoutMs = 35000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    clearTimeout(timeout);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    return data as T;
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out. The server is taking too long — please try again.');
    }
    throw err;
  }
}

export async function fetchMediaMetadata(url: string): Promise<FetchResult> {
  try {
    // 30s timeout for metadata fetch
    return await apiRequest<FetchResult>('/api/fetch', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }, 30000);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error. Please check your connection.';
    return { success: false, error: message };
  }
}

export async function requestDownload(
  url: string,
  formatId?: string,
  type: 'video' | 'audio' | 'thumbnail' = 'video'
): Promise<DownloadResult> {
  try {
    // 30s timeout for download URL generation
    return await apiRequest<DownloadResult>('/api/download', {
      method: 'POST',
      body: JSON.stringify({ url, formatId, type }),
    }, 30000);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Download failed. Please try again.';
    return { success: false, error: message };
  }
}

export async function checkHealth(): Promise<{ status: string; checks: Record<string, unknown> }> {
  try {
    return await apiRequest('/api/health', { method: 'GET' }, 5000);
  } catch {
    return { status: 'error', checks: {} };
  }
}

export async function logEvent(event: string, platform?: string, metadata?: Record<string, unknown>) {
  try {
    await apiRequest('/api/log', {
      method: 'POST',
      body: JSON.stringify({ event, platform, metadata }),
    }, 5000);
  } catch {
    // analytics failures are silent
  }
}

export async function submitContact(name: string, email: string, message: string) {
  return apiRequest<{ success: boolean; message?: string; error?: string }>('/api/contact', {
    method: 'POST',
    body: JSON.stringify({ name, email, message }),
  }, 10000);
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function platformDisplayName(platform: string): string {
  const names: Record<string, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    facebook: 'Facebook',
    twitter: 'Twitter/X',
    pinterest: 'Pinterest',
    vimeo: 'Vimeo',
    reddit: 'Reddit',
  };
  return names[platform] || platform;
}

export function platformColor(platform: string): string {
  const colors: Record<string, string> = {
    youtube: 'text-red-500',
    instagram: 'text-pink-500',
    tiktok: 'text-gray-900 dark:text-white',
    facebook: 'text-blue-600',
    twitter: 'text-sky-500',
    pinterest: 'text-red-600',
    vimeo: 'text-brand-500',
    reddit: 'text-orange-500',
  };
  return colors[platform] || 'text-gray-500';
}