import type { Map as MlMap } from 'maplibre-gl';

/**
 * Aimantation des trains sur les voies réellement dessinées par le fond de carte.
 *
 * Le fond CARTO est construit à partir d'OpenStreetMap : ses tuiles vectorielles contiennent les voies
 * ferrées (couche `transportation`, classe `rail`). Le tracé SNCF Réseau utilisé pour calculer la progression
 * du train peut s'en écarter de quelques centaines de mètres au zoom ; on projette donc chaque position
 * sur la voie OSM la plus proche et orientée dans le sens de marche du train.
 */

const SOURCE = 'carto';
const SOURCE_LAYER = 'transportation';
/** En dessous de ce zoom, l'écart est inférieur à quelques pixels : inutile d'aimanter. */
export const SNAP_MIN_ZOOM = 9.5;
/** Voies de service à ignorer (faisceaux, voies de garage…) */
const SERVICE_EXCLUDED = new Set(['yard', 'siding', 'spur', 'crossover']);
const CELL = 0.01; // ~1 km

export class RailSnapper {
  /** Segments aplatis : [ax, ay, bx, by, ax, ay, …] */
  private segs: number[] = [];
  private grid = new Map<string, number[]>();
  active = false;

  clear() {
    this.segs = [];
    this.grid.clear();
    this.active = false;
  }

  /** Relit les voies des tuiles chargées dans la vue courante. */
  rebuild(map: MlMap) {
    if (map.getZoom() < SNAP_MIN_ZOOM || !map.getSource(SOURCE)) {
      this.clear();
      return;
    }
    let features: ReturnType<MlMap['querySourceFeatures']>;
    try {
      features = map.querySourceFeatures(SOURCE, { sourceLayer: SOURCE_LAYER, filter: ['==', ['get', 'class'], 'rail'] });
    } catch {
      this.clear();
      return;
    }
    const lines: number[][][] = [];
    for (const f of features) {
      const service = f.properties?.service as string | undefined;
      if (service && SERVICE_EXCLUDED.has(service)) continue;
      const g = f.geometry;
      if (g.type === 'LineString') lines.push(g.coordinates);
      else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
    }
    this.setLines(lines);
  }

  /** Charge des polylignes [lon, lat] (aussi utilisé directement par les tests). */
  setLines(lines: number[][][]) {
    const segs: number[] = [];
    const grid = new Map<string, number[]>();
    const add = (ax: number, ay: number, bx: number, by: number) => {
      const idx = segs.length;
      segs.push(ax, ay, bx, by);
      // Indexe le segment dans toutes les cellules de sa boîte englobante
      const x0 = Math.floor(Math.min(ax, bx) / CELL);
      const x1 = Math.floor(Math.max(ax, bx) / CELL);
      const y0 = Math.floor(Math.min(ay, by) / CELL);
      const y1 = Math.floor(Math.max(ay, by) / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const k = `${x}:${y}`;
          const cell = grid.get(k);
          if (cell) cell.push(idx);
          else grid.set(k, [idx]);
        }
      }
    };
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!;
        const b = line[i]!;
        add(a[0]!, a[1]!, b[0]!, b[1]!);
      }
    }
    this.segs = segs;
    this.grid = grid;
    this.active = segs.length > 0;
  }

  /**
   * Point le plus proche sur une voie, dans un rayon `maxM` (mètres).
   * Les voies qui croisent la trajectoire (angle fort avec le cap du train) sont pénalisées.
   */
  snap(lon: number, lat: number, bearing: number, maxM: number): [number, number] | null {
    if (!this.active) return null;
    const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
    const ky = 110_540;
    const rCells = Math.ceil(maxM / 1000 / (CELL * 100)) + 1;
    const cx = Math.floor(lon / CELL);
    const cy = Math.floor(lat / CELL);
    const seen = new Set<number>();
    let best: [number, number] | null = null;
    let bestScore = Infinity;
    const s = this.segs;
    for (let dx = -rCells; dx <= rCells; dx++) {
      for (let dy = -rCells; dy <= rCells; dy++) {
        const cell = this.grid.get(`${cx + dx}:${cy + dy}`);
        if (!cell) continue;
        for (const i of cell) {
          if (seen.has(i)) continue;
          seen.add(i);
          // Projection dans un repère local métrique centré sur le train
          const ax = (s[i]! - lon) * kx;
          const ay = (s[i + 1]! - lat) * ky;
          const bx = (s[i + 2]! - lon) * kx;
          const by = (s[i + 3]! - lat) * ky;
          const vx = bx - ax;
          const vy = by - ay;
          const len2 = vx * vx + vy * vy;
          if (len2 === 0) continue;
          const t = Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2));
          const px = ax + t * vx;
          const py = ay + t * vy;
          const d = Math.hypot(px, py);
          if (d > maxM) continue;
          // Écart d'orientation (voie non orientée : 0 à 90°)
          const segBearing = (Math.atan2(vx, vy) * 180) / Math.PI;
          let diff = Math.abs(((segBearing - bearing + 540) % 360) - 180);
          diff = Math.min(diff, 180 - diff);
          const score = d + diff * 4;
          if (score < bestScore) {
            bestScore = score;
            best = [lon + px / kx, lat + py / ky];
          }
        }
      }
    }
    return best;
  }
}

/** Rayon d'aimantation selon le zoom : ~40 px, plafonné à 500 m. */
export function snapRadius(zoom: number, lat: number): number {
  const metersPerPixel = (156_543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return Math.min(500, Math.max(60, metersPerPixel * 40));
}
