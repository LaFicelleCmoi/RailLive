import { config } from './config.js';
import { recordUpstreamCall } from './quota.js';
import { cached, type CachedResponse } from './cache.js';
import { localQuotaReached } from './quota.js';

/**
 * Client de l'API SNCF (https://api.sncf.com/v1/coverage/sncf).
 * L'API SNCF repose sur le moteur Navitia : même format de réponse.
 */

const TIMEOUT_MS = 20_000;

// Basic Auth : clé en nom d'utilisateur, mot de passe vide.
const AUTH_HEADER = `Basic ${Buffer.from(`${config.SNCF_API_KEY}:`).toString('base64')}`;

export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const root = config.SNCF_API_BASE_URL.replace(/\/+$/, '');
/** https://api.sncf.com/v1/coverage/sncf */
export const coverageBase = `${root}/coverage/${config.COVERAGE}`;
/** https://api.sncf.com/v1/coverage */
export const coverageRoot = `${root}/coverage`;

/**
 * Appelle l'API SNCF avec l'authentification serveur.
 * `url` est construite exclusivement par le serveur (jamais transmise telle quelle par le client).
 */
export async function sncfFetch(url: string): Promise<CachedResponse> {
  if (localQuotaReached()) {
    throw new UpstreamError(429, 'quota_exceeded', 'Quota journalier du proxy atteint');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: AUTH_HEADER,
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'RailHub/0.1 (+proxy)',
      },
      signal: controller.signal,
      redirect: 'error',
    });
    recordUpstreamCall(res.status, res.headers);
    const body = await res.text();
    return { status: res.status, body, storedAt: Date.now() };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new UpstreamError(504, 'upstream_timeout', 'L’API SNCF ne répond pas (délai dépassé)');
    }
    throw new UpstreamError(502, 'upstream_unreachable', 'Impossible de joindre l’API SNCF');
  }
  finally {
    clearTimeout(timer);
  }
}

/**
 * Appel JSON mis en cache, pour les agrégations côté serveur.
 * `path` est relatif à la couverture, `params` est déjà validé par l'appelant.
 */
export async function sncfJson<T>(path: string, params: Record<string, string | string[]>, ttlMs: number): Promise<T> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else sp.set(k, v);
  }
  const url = `${coverageBase}/${path}${sp.size ? `?${sp}` : ''}`;
  const { value } = await cached(url, ttlMs, () => sncfFetch(url));
  if (value.status === 429) throw new UpstreamError(429, 'quota_exceeded', 'Quota API SNCF atteint');
  if (value.status === 401 || value.status === 403) throw new UpstreamError(502, 'upstream_auth', 'Clé API SNCF refusée');
  const json = JSON.parse(value.body) as T & { error?: { id: string; message: string } };
  if (value.status >= 400 && !(json as { error?: unknown }).error) {
    throw new UpstreamError(value.status, 'upstream_error', `L’API SNCF a répondu ${value.status}`);
  }
  return json;
}
