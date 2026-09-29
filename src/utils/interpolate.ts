import { bearing, type LngLat } from './geo';

/** Arrêt d'une circulation, horaires en secondes epoch (temps réel si connu). */
export interface TimedStop {
  lon: number;
  lat: number;
  /** arrivée (s epoch) */
  a: number;
  /** départ (s epoch) */
  d: number;
}

export type TrainState = 'waiting' | 'running' | 'dwelling' | 'arrived';

export interface TrainPosition {
  lon: number;
  lat: number;
  bearing: number;
  state: TrainState;
  /** Index du dernier arrêt atteint ou quitté */
  index: number;
  /** Avancement sur le tronçon courant (0 à 1) */
  progress: number;
}

/** Lissage : accélération et freinage doux aux abords des gares. */
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

/**
 * Position estimée d'un train à l'instant `t` (s epoch) par interpolation
 * linéaire (lissée) entre deux arrêts successifs. Aucune donnée GPS n'est utilisée.
 */
export function interpolatePosition(stops: readonly TimedStop[], t: number, smooth = true): TrainPosition | null {
  const n = stops.length;
  if (n === 0) return null;
  const first = stops[0]!;
  const last = stops[n - 1]!;

  if (n === 1 || t <= first.d) {
    const next = stops[1] ?? first;
    return { lon: first.lon, lat: first.lat, bearing: bearing([first.lon, first.lat], [next.lon, next.lat]), state: 'waiting', index: 0, progress: 0 };
  }
  if (t >= last.a) {
    const prev = stops[n - 2]!;
    return { lon: last.lon, lat: last.lat, bearing: bearing([prev.lon, prev.lat], [last.lon, last.lat]), state: 'arrived', index: n - 1, progress: 1 };
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
  const heading = bearing([cur.lon, cur.lat], [next.lon, next.lat]);

  if (t < cur.d) {
    return { lon: cur.lon, lat: cur.lat, bearing: heading, state: 'dwelling', index: lo, progress: 0 };
  }
  const span = next.a - cur.d;
  const raw = span > 0 ? Math.min(1, Math.max(0, (t - cur.d) / span)) : 1;
  const k = smooth ? ease(raw) : raw;
  return {
    lon: cur.lon + (next.lon - cur.lon) * k,
    lat: cur.lat + (next.lat - cur.lat) * k,
    bearing: heading,
    state: 'running',
    index: lo,
    progress: raw,
  };
}

/** Tracé (polyligne) d'une circulation. */
export function pathOf(stops: readonly { lon: number; lat: number }[]): LngLat[] {
  return stops.map((s) => [s.lon, s.lat] as LngLat);
}
