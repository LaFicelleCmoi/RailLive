import type { LngLat } from './geo';

/** Décode une polyligne « Google » (précision 5) en [lon, lat]. */
export function decodePolyline(s: string): LngLat[] {
  const out: LngLat[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  while (i < s.length) {
    for (let k = 0; k < 2; k++) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = s.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < s.length);
      const v = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += v;
      else lon += v;
    }
    out.push([lon / 1e5, lat / 1e5]);
  }
  return out;
}
