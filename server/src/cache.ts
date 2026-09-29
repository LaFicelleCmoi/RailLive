import { LRUCache } from 'lru-cache';

export interface CachedResponse {
  status: number;
  body: string;
  storedAt: number;
}

const cache = new LRUCache<string, CachedResponse>({
  max: 2000,
  // ~150 Mo max : on compte la longueur des chaînes (approximation raisonnable)
  maxSize: 150 * 1024 * 1024,
  sizeCalculation: (v) => Math.max(1, v.body.length),
  ttlAutopurge: false,
  allowStale: false,
});

const inflight = new Map<string, Promise<CachedResponse>>();

export const cacheStats = { hits: 0, misses: 0, coalesced: 0 };

/**
 * Renvoie la valeur en cache si fraîche, sinon exécute `loader` une seule fois
 * même si plusieurs requêtes identiques arrivent en même temps.
 * Seules les réponses 200 sont mises en cache.
 */
export async function cached(
  key: string,
  ttlMs: number,
  loader: () => Promise<CachedResponse>,
): Promise<{ value: CachedResponse; hit: boolean }> {
  const existing = cache.get(key);
  if (existing) {
    cacheStats.hits++;
    return { value: existing, hit: true };
  }

  const pending = inflight.get(key);
  if (pending) {
    cacheStats.coalesced++;
    return { value: await pending, hit: true };
  }

  cacheStats.misses++;
  const promise = loader()
    .then((value) => {
      if (value.status === 200 && ttlMs > 0) cache.set(key, value, { ttl: ttlMs });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return { value: await promise, hit: false };
}

export function cacheInfo() {
  return {
    entries: cache.size,
    sizeBytes: cache.calculatedSize,
    ...cacheStats,
  };
}
