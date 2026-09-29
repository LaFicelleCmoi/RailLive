import type { BaseResponse } from '@/types/navitia';

export type ApiErrorCode =
  | 'quota_exceeded'
  | 'rate_limited'
  | 'invalid_params'
  | 'forbidden_endpoint'
  | 'upstream_auth'
  | 'upstream_timeout'
  | 'upstream_unreachable'
  | 'not_found'
  | 'no_solution'
  | 'network'
  | 'internal'
  | string;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isQuota() {
    return this.code === 'quota_exceeded';
  }
  get isRetryable() {
    return this.status >= 500 || this.code === 'network' || this.code === 'rate_limited';
  }
}

export type ParamValue = string | number | boolean | undefined | null | readonly (string | number)[];
export type Params = Record<string, ParamValue>;

export function toQueryString(params: Params = {}): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      const k = key.endsWith('[]') ? key : `${key}[]`;
      for (const v of value) sp.append(k, String(v));
    } else {
      sp.set(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Messages lisibles pour les erreurs connues de l'API SNCF (champ error.id). */
const API_ERRORS: Record<string, string> = {
  no_solution: 'Aucune solution trouvée pour ces critères.',
  unknown_object: 'Objet introuvable dans le référentiel SNCF.',
  no_origin: 'Point de départ introuvable.',
  no_destination: 'Point d’arrivée introuvable.',
  no_origin_nor_destination: 'Départ et arrivée introuvables.',
  date_out_of_bounds: 'Date hors de la période de validité des données.',
  bad_filter: 'Filtre invalide.',
  unable_to_parse: 'Requête invalide.',
};

/**
 * Appelle le proxy : GET /api/sncf/<path>?<params>.
 * La clé API SNCF n'existe jamais côté client.
 */
export async function sncf<T extends BaseResponse>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  const clean = path.replace(/^\/+/, '');
  return getJson<T>(`/api/sncf/${clean}${toQueryString(params)}`, signal);
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'network', 'Connexion au serveur RailHub impossible.');
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, 'internal', 'Réponse illisible du serveur.');
    }
  }

  const err = (data as { error?: { code?: string; id?: string; message?: string; details?: string[] } } | null)?.error;

  if (!res.ok) {
    if (res.status === 429) {
      const code = err?.code === 'rate_limited' ? 'rate_limited' : 'quota_exceeded';
      throw new ApiError(429, code, err?.message ?? 'Quota atteint.');
    }
    const code = err?.code ?? err?.id ?? (res.status === 404 ? 'not_found' : 'internal');
    const message = (err?.id && API_ERRORS[err.id]) || err?.message || `Erreur ${res.status}`;
    throw new ApiError(res.status, code, message, err?.details);
  }

  // L'API renvoie parfois 200 avec un champ error (ex. no_solution)
  if (err?.id && !(data as Record<string, unknown>)?.journeys) {
    throw new ApiError(404, err.id, API_ERRORS[err.id] ?? err.message ?? 'Erreur de l’API SNCF');
  }
  return data as T;
}
