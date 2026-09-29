import { bearing, type LngLat } from './geo';

/** Arrêt d'une circulation, horaires en secondes epoch (temps réel si connu). */
export interface TimedStop {
  lon: number;
  lat: number;
  /** arrivée (s epoch) */
  a: number;
  /** départ (s epoch) */
  d: number;
  /** Tracé sur les rails jusqu'à l'arrêt suivant (préparé par `preparePath`) ; absent = ligne droite */
  path?: PreparedPath;
}

/** Polyligne avec longueurs cumulées, pour se déplacer à distance constante le long des rails. */
export interface PreparedPath {
  pts: LngLat[];
  /** Longueur cumulée (unités planes locales) à chaque sommet */
  cum: Float64Array;
  total: number;
}

export type TrainState = 'waiting' | 'running' | 'dwelling' | 'arrived';

export interface TrainPosition {
  lon: number;
  lat: number;
  bearing: number;
  state: TrainState;
  /** Index du dernier arrêt atteint ou quitté */
  index: number;
  /** Avancement (temps) sur le tronçon courant (0 à 1) */
  progress: number;
}

/**
 * Pré-calcule les longueurs cumulées d'une polyligne.
 * Projection équirectangulaire locale : précise à mieux que 1 % à l'échelle d'un tronçon.
 */
export function preparePath(pts: LngLat[]): PreparedPath | undefined {
  if (pts.length < 2) return undefined;
  const cum = new Float64Array(pts.length);
  const k = Math.cos((pts[0]![1] * Math.PI) / 180);
  for (let i = 1; i < pts.length; i++) {
    const dx = (pts[i]![0] - pts[i - 1]![0]) * k;
    const dy = pts[i]![1] - pts[i - 1]![1];
    cum[i] = cum[i - 1]! + Math.hypot(dx, dy);
  }
  const total = cum[pts.length - 1]!;
  return total > 0 ? { pts, cum, total } : undefined;
}

/** Point situé à la fraction `f` (0 à 1) de la longueur d'une polyligne, avec le cap local. */
export function pointAlong(p: PreparedPath, f: number): { lon: number; lat: number; bearing: number } {
  const target = Math.min(1, Math.max(0, f)) * p.total;
  let lo = 0;
  let hi = p.pts.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (p.cum[mid]! <= target) lo = mid;
    else hi = mid;
  }
  const a = p.pts[lo]!;
  const b = p.pts[hi]!;
  const span = p.cum[hi]! - p.cum[lo]!;
  const t = span > 0 ? (target - p.cum[lo]!) / span : 0;
  return { lon: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, bearing: bearing(a, b) };
}

/** Lissage : accélération et freinage doux aux abords des gares. */
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

/**
 * Position estimée d'un train à l'instant `t` (s epoch) : interpolation entre deux arrêts
 * successifs, le long des rails quand le tracé est connu (sinon en ligne droite).
 * Aucune donnée GPS n'est utilisée.
 */
export function interpolatePosition(stops: readonly TimedStop[], t: number, smooth = true): TrainPosition | null {
  const n = stops.length;
  if (n === 0) return null;
  const first = stops[0]!;
  const last = stops[n - 1]!;

  if (n === 1 || t <= first.d) {
    const next = stops[1] ?? first;
    const heading = first.path ? pointAlong(first.path, 0).bearing : bearing([first.lon, first.lat], [next.lon, next.lat]);
    return { lon: first.lon, lat: first.lat, bearing: heading, state: 'waiting', index: 0, progress: 0 };
  }
  if (t >= last.a) {
    const prev = stops[n - 2]!;
    const heading = prev.path ? pointAlong(prev.path, 1).bearing : bearing([prev.lon, prev.lat], [last.lon, last.lat]);
    return { lon: last.lon, lat: last.lat, bearing: heading, state: 'arrived', index: n - 1, progress: 1 };
  }

  // Recherche dichotomique du tronçon : dernier arrêt dont l'arrivée est <= t
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (stops[mid]!.a <= t) lo = mid;
    else hi = mid - 1;
  }
  const cur = stops[lo]!;
  const next = stops[Math.min(lo + 1, n - 1)]!;

  if (t < cur.d) {
    const heading = cur.path ? pointAlong(cur.path, 0).bearing : bearing([cur.lon, cur.lat], [next.lon, next.lat]);
    return { lon: cur.lon, lat: cur.lat, bearing: heading, state: 'dwelling', index: lo, progress: 0 };
  }
  const span = next.a - cur.d;
  const raw = span > 0 ? Math.min(1, Math.max(0, (t - cur.d) / span)) : 1;
  const k = smooth ? ease(raw) : raw;

  if (cur.path) {
    const p = pointAlong(cur.path, k);
    return { lon: p.lon, lat: p.lat, bearing: p.bearing, state: 'running', index: lo, progress: raw };
  }
  return {
    lon: cur.lon + (next.lon - cur.lon) * k,
    lat: cur.lat + (next.lat - cur.lat) * k,
    bearing: bearing([cur.lon, cur.lat], [next.lon, next.lat]),
    state: 'running',
    index: lo,
    progress: raw,
  };
}

/** Tracé (polyligne) d'une circulation. */
export function pathOf(stops: readonly { lon: number; lat: number }[]): LngLat[] {
  return stops.map((s) => [s.lon, s.lat] as LngLat);
}
