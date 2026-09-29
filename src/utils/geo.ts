import type { Coord } from '@/types/navitia';

export type LngLat = [number, number];

export function toLngLat(c: Coord | undefined | null): LngLat | null {
  if (!c) return null;
  const lon = Number(c.lon);
  const lat = Number(c.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || (lon === 0 && lat === 0)) return null;
  return [lon, lat];
}

/** Distance en mètres (formule de haversine). */
export function haversine(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Cap (degrés, 0 = nord) de a vers b. */
export function bearing(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) - Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0).replace('.', ',')} km`;
}

/** Emprise [ouest, sud, est, nord] d'un ensemble de points. */
export function boundsOf(points: LngLat[]): [number, number, number, number] | null {
  if (!points.length) return null;
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  for (const [x, y] of points) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return [w, s, e, n];
}

/** Centre de la France métropolitaine */
export const FRANCE_CENTER: LngLat = [2.35, 46.6];
export const FRANCE_BOUNDS: [number, number, number, number] = [-5.2, 41.3, 9.6, 51.2];
