/** Encodage « Google polyline » (précision 5) : ~5 octets par point au lieu de ~20 en JSON. */
export function encodePolyline(coords: readonly (readonly [number, number])[]): string {
  let out = '';
  let pLat = 0;
  let pLon = 0;
  for (const [lon, lat] of coords) {
    const la = Math.round(lat * 1e5);
    const lo = Math.round(lon * 1e5);
    out += encodeValue(la - pLat) + encodeValue(lo - pLon);
    pLat = la;
    pLon = lo;
  }
  return out;
}

function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let s = '';
  while (n >= 0x20) {
    s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return s + String.fromCharCode(n + 63);
}
