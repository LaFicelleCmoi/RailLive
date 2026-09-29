import type { Map as MlMap } from 'maplibre-gl';

/**
 * Aimantation des trains sur les voies réellement dessinées par le fond de carte.
 *
 * Le fond CARTO est construit à partir d'OpenStreetMap : ses tuiles vectorielles contiennent les voies
 * ferrées (couche `transportation`, classe `rail`). Le tracé SNCF Réseau utilisé pour calculer la progression
 * du train peut s'en écarter de quelques centaines de mètres ; on projette donc chaque position
 * sur la voie OSM la plus proche et orientée dans le sens de marche du train.
 *
 * Robustesse au zoom :
 * - le rayon est exprimé en mètres (l'écart SNCF Réseau / OSM ne dépend pas du zoom) ;
 * - les voies lues sont conservées par niveau de tuile et fusionnées : en dézoomant ou en zoomant,
 *   les trains restent collés aux voies déjà connues pendant le chargement des nouvelles tuiles ;
 * - chaque train garde une préférence pour la voie sur laquelle il était (pas de saut entre deux voies).
 */

const SOURCE = 'carto';
const SOURCE_LAYER = 'transportation';
/** Zoom à partir duquel les voies OSM sont dessinées (BasemapRailLayer) et les trains aimantés. */
export const SNAP_MIN_ZOOM = 9;
/** Tuiles CARTO disponibles jusqu'au zoom 14 (sur-zoomées au-delà). */
const SOURCE_MAX_ZOOM = 14;
/** Rayon d'aimantation : écart maximal admis entre le tracé SNCF Réseau et la voie OSM. */
export const SNAP_RADIUS_M = 600;
/** Rayon sur un tronçon sans tracé ferroviaire (ligne droite de secours). */
export const SNAP_RADIUS_APPROX_M = 1500;
/** Voies de service à ignorer (faisceaux, voies de garage…) */
const SERVICE_EXCLUDED = new Set(['yard', 'siding', 'spur', 'crossover']);
const CELL = 0.01; // ~1 km
/** Plafond mémoire par niveau de tuile (segments) */
const MAX_SEGS = 150_000;

class SegmentIndex {
  /** Segments aplatis : [ax, ay, bx, by, ax, ay, …] */
  segs: number[] = [];
  grid = new Map<string, number[]>();
  private keys = new Set<string>();

  get size() {
    return this.segs.length / 4;
  }

  /** Ajoute des polylignes ; les segments déjà connus (même tuile relue) sont ignorés. */
  add(lines: number[][][]) {
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!;
        const b = line[i]!;
        this.addSeg(a[0]!, a[1]!, b[0]!, b[1]!);
      }
    }
  }

  private addSeg(ax: number, ay: number, bx: number, by: number) {
    if (ax === bx && ay === by) return;
    // Clé non orientée, arrondie à ~1 m : dédoublonne les voies relues et les bords de tuiles
    const k1 = `${ax.toFixed(5)},${ay.toFixed(5)}`;
    const k2 = `${bx.toFixed(5)},${by.toFixed(5)}`;
    const key = k1 < k2 ? `${k1};${k2}` : `${k2};${k1}`;
    if (this.keys.has(key)) return;
    this.keys.add(key);
    const idx = this.segs.length;
    this.segs.push(ax, ay, bx, by);
    // Indexe le segment dans toutes les cellules de sa boîte englobante
    const x0 = Math.floor(Math.min(ax, bx) / CELL);
    const x1 = Math.floor(Math.max(ax, bx) / CELL);
    const y0 = Math.floor(Math.min(ay, by) / CELL);
    const y1 = Math.floor(Math.max(ay, by) / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const k = `${x}:${y}`;
        const cell = this.grid.get(k);
        if (cell) cell.push(idx);
        else this.grid.set(k, [idx]);
      }
    }
  }
}

export class RailSnapper {
  /** Voies connues, par niveau de tuile (les géométries sont plus ou moins généralisées selon le niveau) */
  private levels = new Map<number, SegmentIndex>();
  /** Niveau de tuile affiché : ses voies sont prioritaires */
  private current = -1;

  get active() {
    for (const l of this.levels.values()) if (l.size > 0) return true;
    return false;
  }

  clear() {
    this.levels.clear();
  }

  /** Lit les voies des tuiles chargées dans la vue courante et les ajoute à celles déjà connues. */
  rebuild(map: MlMap) {
    const zoom = map.getZoom();
    this.current = Math.min(SOURCE_MAX_ZOOM, Math.floor(zoom));
    if (zoom < SNAP_MIN_ZOOM || !map.getSource(SOURCE)) return;
    let features: ReturnType<MlMap['querySourceFeatures']>;
    try {
      features = map.querySourceFeatures(SOURCE, { sourceLayer: SOURCE_LAYER, filter: ['==', ['get', 'class'], 'rail'] });
    } catch {
      return;
    }
    this.addLines(extractLines(features), this.current);
  }

  /** Remplace toutes les voies (tests). */
  setLines(lines: number[][][], level = 0) {
    this.levels.clear();
    this.current = level;
    this.addLines(lines, level);
  }

  addLines(lines: number[][][], level: number) {
    let idx = this.levels.get(level);
    if (!idx || idx.size > MAX_SEGS) {
      idx = new SegmentIndex();
      this.levels.set(level, idx);
    }
    idx.add(lines);
  }

  /**
   * Point le plus proche sur une voie, dans un rayon `maxM` (mètres).
   * Les voies qui croisent la trajectoire (angle fort avec le cap du train) sont pénalisées, et la voie
   * sur laquelle le train se trouvait à l'image précédente (`prev`) est privilégiée.
   * Cherche d'abord dans les voies du niveau de tuile affiché, puis dans les niveaux voisins.
   */
  snap(lon: number, lat: number, bearing: number, maxM: number, prev?: [number, number] | null): [number, number] | null {
    const order = [...this.levels.keys()].sort((a, b) => Math.abs(a - this.current) - Math.abs(b - this.current) || b - a);
    for (const level of order) {
      const p = snapIn(this.levels.get(level)!, lon, lat, bearing, maxM, prev);
      if (p) return p;
    }
    return null;
  }
}

function extractLines(features: ReturnType<MlMap['querySourceFeatures']>) {
  const lines: number[][][] = [];
  for (const f of features) {
    const service = f.properties?.service as string | undefined;
    if (service && SERVICE_EXCLUDED.has(service)) continue;
    const g = f.geometry;
    if (g.type === 'LineString') lines.push(g.coordinates);
    else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
  }
  return lines;
}

function snapIn(
  index: SegmentIndex,
  lon: number,
  lat: number,
  bearing: number,
  maxM: number,
  prev?: [number, number] | null,
): [number, number] | null {
  if (index.size === 0) return null;
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_540;
  const rx = Math.ceil(maxM / (CELL * kx));
  const ry = Math.ceil(maxM / (CELL * ky));
  const cx = Math.floor(lon / CELL);
  const cy = Math.floor(lat / CELL);
  // Position aimantée précédente, dans le repère local (ignorée si le train a « sauté »)
  let qx = NaN;
  let qy = NaN;
  if (prev) {
    qx = (prev[0] - lon) * kx;
    qy = (prev[1] - lat) * ky;
    if (Math.hypot(qx, qy) > maxM * 2) qx = qy = NaN;
  }
  const seen = new Set<number>();
  let best: [number, number] | null = null;
  let bestScore = Infinity;
  const s = index.segs;
  for (let dx = -rx; dx <= rx; dx++) {
    for (let dy = -ry; dy <= ry; dy++) {
      const cell = index.grid.get(`${cx + dx}:${cy + dy}`);
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
        let score = d + diff * 4;
        // Continuité : rester sur la voie de l'image précédente plutôt que sauter sur une voie voisine
        if (qx === qx) score += Math.min(150, 0.5 * distToSegment(qx, qy, ax, ay, vx, vy, len2));
        if (score < bestScore) {
          bestScore = score;
          best = [lon + px / kx, lat + py / ky];
        }
      }
    }
  }
  return best;
}

function distToSegment(x: number, y: number, ax: number, ay: number, vx: number, vy: number, len2: number) {
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2));
  return Math.hypot(ax + t * vx - x, ay + t * vy - y);
}
