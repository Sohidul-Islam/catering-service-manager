export const DASHBOARD_FRESH_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const dashboardCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

export function getCachedDashboard<T>(key: string): { data: T; isFresh: boolean } | null {
  const entry = dashboardCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  const isFresh = Date.now() - entry.fetchedAt < DASHBOARD_FRESH_TTL_MS;
  return { data: entry.data, isFresh };
}

export function setCachedDashboard<T>(key: string, data: T): void {
  dashboardCache.set(key, { data, fetchedAt: Date.now() });
}

export function invalidateDashboardCache(key?: string): void {
  if (key) {
    dashboardCache.delete(key);
    inFlightRequests.delete(key);
  } else {
    dashboardCache.clear();
    inFlightRequests.clear();
  }
}

export async function fetchDashboardDeduped<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fetcher().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
}
