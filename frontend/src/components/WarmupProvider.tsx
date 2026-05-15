'use client';

import { useEffect } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://fetchclip-backend.onrender.com';

/**
 * WarmupProvider — silently pings the backend the moment the page loads.
 * This wakes up Render's free tier BEFORE the user clicks Fetch,
 * so by the time they paste a URL, the server is already warm.
 */
export default function WarmupProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Ping immediately on mount
    const warmup = () => {
      fetch(`${BACKEND_URL}/ping`, {
        method: 'GET',
        cache: 'no-store',
      }).catch(() => {
        // Silent — user never sees this
      });
    };

    warmup();

    // Also ping every 4 minutes to keep server warm while user is on the page
    const interval = setInterval(warmup, 4 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return <>{children}</>;
}