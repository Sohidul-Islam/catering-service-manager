export const CALENDAR_FRESH_TTL_MS = 120_000;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const calendarCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

export function getCachedCalendar<T>(key: string): { data: T; isFresh: boolean } | null {
  const entry = calendarCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  const isFresh = Date.now() - entry.fetchedAt < CALENDAR_FRESH_TTL_MS;
  return { data: entry.data, isFresh };
}

export function setCachedCalendar<T>(key: string, data: T): void {
  calendarCache.set(key, { data, fetchedAt: Date.now() });
}

export function invalidateCalendarCache(key?: string): void {
  if (key) {
    calendarCache.delete(key);
    inFlightRequests.delete(key);
  } else {
    calendarCache.clear();
    inFlightRequests.clear();
  }
}

export async function fetchCalendarDeduped<T>(
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
