import { config } from './config.js';
import { recordUpstreamCall } from './quota.js';
import type { CachedResponse } from './cache.js';

const TIMEOUT_MS = 15_000;

// Basic Auth : clé en nom d'utilisateur, mot de passe vide (accepté par api.sncf.com et api.navitia.io).
const AUTH_HEADER = `Basic ${Buffer.from(`${config.NAVITIA_TOKEN}:`).toString('base64')}`;

export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** URL de base de la couverture, ex. https://api.navitia.io/v1/coverage/sncf */
export const coverageBase = `${config.NAVITIA_BASE_URL.replace(/\/+$/, '')}/coverage/${config.NAVITIA_COVERAGE}`;
export const coverageRoot = `${config.NAVITIA_BASE_URL.replace(/\/+$/, '')}/coverage`;

/**
 * Appelle Navitia avec l'authentification serveur.
 * `url` est construite exclusivement par le serveur (jamais transmise telle quelle par le client).
 */
export async function navitiaFetch(url: string): Promise<CachedResponse> {
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
      throw new UpstreamError(504, 'upstream_timeout', 'Navitia ne répond pas (délai dépassé)');
    }
    throw new UpstreamError(502, 'upstream_unreachable', 'Impossible de joindre Navitia');
  } finally {
    clearTimeout(timer);
  }
}

/** Version JSON pour les agrégations côté serveur. */
export async function navitiaJson<T>(url: string): Promise<T> {
  const r = await navitiaFetch(url);
  if (r.status === 429) throw new UpstreamError(429, 'quota_exceeded', 'Quota Navitia atteint');
  if (r.status === 401 || r.status === 403) throw new UpstreamError(502, 'upstream_auth', 'Authentification Navitia refusée');
  if (r.status >= 400) throw new UpstreamError(r.status, 'upstream_error', `Navitia a répondu ${r.status}`);
  return JSON.parse(r.body) as T;
}
