import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admin — FetchClip Pro', robots: { index: false, follow: false } };

async function getStats() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
  const adminKey = process.env.ADMIN_SECRET_KEY;
  if (!adminKey) return null;

  try {
    const res = await fetch(`${backendUrl}/api/admin/stats`, {
      headers: { 'x-admin-key': adminKey },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const params = await searchParams;
  const adminKey = process.env.ADMIN_SECRET_KEY;

  if (!adminKey || params.key !== adminKey) {
    redirect('/');
  }

  const stats = await getStats();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold gradient-text">FetchClip Admin</h1>
          <span className="platform-badge">Live Dashboard</span>
        </div>

        {!stats ? (
          <div className="glass-card p-8 text-center text-gray-500">
            Failed to load stats. Check backend connectivity.
          </div>
        ) : (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <div className="glass-card p-6">
                <p className="text-sm text-gray-500 mb-1">Total Downloads</p>
                <p className="text-4xl font-bold gradient-text">{stats.total?.toLocaleString() || 0}</p>
              </div>
              <div className="glass-card p-6">
                <p className="text-sm text-gray-500 mb-1">Failed Extractions</p>
                <p className="text-4xl font-bold text-red-500">{stats.failed?.toLocaleString() || 0}</p>
              </div>
              <div className="glass-card p-6">
                <p className="text-sm text-gray-500 mb-1">Success Rate</p>
                <p className="text-4xl font-bold text-green-500">
                  {stats.total > 0
                    ? `${(((stats.total - stats.failed) / stats.total) * 100).toFixed(1)}%`
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Platform breakdown */}
            {stats.platformCounts && Object.keys(stats.platformCounts).length > 0 && (
              <div className="glass-card p-6 mb-8">
                <h2 className="text-lg font-semibold mb-4">Downloads by Platform</h2>
                <div className="space-y-3">
                  {Object.entries(stats.platformCounts as Record<string, number>)
                    .sort(([, a], [, b]) => b - a)
                    .map(([platform, count]) => {
                      const total = Object.values(stats.platformCounts as Record<string, number>).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? (count / total) * 100 : 0;
                      return (
                        <div key={platform}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="capitalize font-medium">{platform}</span>
                            <span className="text-gray-500">{count} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-brand-500 to-accent-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Recent downloads */}
            {stats.recent && stats.recent.length > 0 && (
              <div className="glass-card p-6">
                <h2 className="text-lg font-semibold mb-4">Recent Downloads</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                        <th className="pb-3 pr-4">Platform</th>
                        <th className="pb-3 pr-4">Title</th>
                        <th className="pb-3 pr-4">Type</th>
                        <th className="pb-3 pr-4">Status</th>
                        <th className="pb-3">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recent.map((row: Record<string, unknown>, i: number) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 pr-4 capitalize">{String(row.platform || '')}</td>
                          <td className="py-2 pr-4 max-w-xs truncate">{String(row.title || '').slice(0, 50)}</td>
                          <td className="py-2 pr-4">{String(row.type || 'video')}</td>
                          <td className="py-2 pr-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.success ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                              {row.success ? 'OK' : 'Failed'}
                            </span>
                          </td>
                          <td className="py-2 text-gray-400 text-xs">
                            {row.created_at ? new Date(String(row.created_at)).toLocaleString() : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
