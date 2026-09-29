import type { Params } from './client';

/** Paramètres communs supportés par la couche API. */
export interface CommonParams {
  depth?: 0 | 1 | 2 | 3;
  /** Désactivé par défaut sur les listes pour alléger les réponses. */
  disable_geojson?: boolean;
  filter?: string;
  count?: number;
  start_page?: number;
}

/** Valeurs par défaut pour les listes du référentiel. */
export function listParams(p: CommonParams & Params = {}): Params {
  return { disable_geojson: true, depth: 1, count: 25, start_page: 0, ...p };
}

/** Valeurs par défaut pour un objet unique. */
export function objectParams(p: CommonParams & Params = {}): Params {
  return { depth: 2, ...p };
}

/** Encode un identifiant Navitia pour un segment de chemin (conserve « : » et « ; »). */
export function seg(id: string): string {
  return encodeURIComponent(id).replace(/%3A/gi, ':').replace(/%3B/gi, ';');
}
