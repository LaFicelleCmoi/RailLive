import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LRUCache } from 'lru-cache';
import { log } from '../utils/redact.js';
import { encodePolyline } from './polyline.js';

/**
 * Graphe du Réseau Ferré National (SNCF Réseau, open data ODbL, jeu « Lignes par statut »).
 *
 * L'API SNCF ne fournit aucune géométrie de voie : on télécharge les tracés des lignes exploitées,
 * on en construit un graphe, puis on calcule le plus court chemin sur les rails entre deux gares
 * successives (A*). Le résultat sert à faire circuler les trains le long des voies.
 */

const SOURCE_URL =
  'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/lignes-par-statut/exports/geojson?select=code_ligne,statut,geo_shape';
/** Tronçons réellement circulés */
const USABLE = new Set(['Exploitée', 'S9A3 - Ligne en travaux']);
const REFRESH_MS = 30 * 24 * 3600_000;

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(here, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'rfn-lignes.geojson');

type LngLat = [number, number];

// --- Structure du graphe (tableaux compacts) -------------------------------
let lon: Float64Array = new Float64Array(0);
let lat: Float64Array = new Float64Array(0);
let adj: number[][] = [];
let adjW: number[][] = [];
/** Index spatial : cellule de 0,02° → nœuds */
const grid = new Map<string, number[]>();
const CELL = 0.02;

let state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
export const railStats = { nodes: 0, edges: 0, lines: 0, loadedAt: null as string | null, error: null as string | null };

/** '' = pas de tracé ferroviaire (lru-cache n'accepte pas null comme valeur) */
const routeCache = new LRUCache<string, string>({ max: 50_000 });

export function railReady() {
  return state === 'ready';
}

function haversine(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const cellKey = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;

/** Nœud le plus proche d'un point, dans un rayon maximal (m). */
function nearestNode(x: number, y: number, maxM: number, exclude?: (n: number) => boolean): number {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  const ring = Math.ceil(maxM / 1500) + 1;
  let best = -1;
  let bestD = maxM;
  for (let dx = -ring; dx <= ring; dx++) {
    for (let dy = -ring; dy <= ring; dy++) {
      const cell = grid.get(`${cx + dx}:${cy + dy}`);
      if (!cell) continue;
      for (const n of cell) {
        if (exclude?.(n)) continue;
        const d = haversine(x, y, lon[n]!, lat[n]!);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
    }
  }
  return best;
}

interface GeoFeature {
  properties?: { statut?: string; code_ligne?: string };
  geometry?: { type: string; coordinates: number[][] | number[][][] } | null;
}

function build(features: GeoFeature[]) {
  const index = new Map<string, number>();
  const xs: number[] = [];
  const ys: number[] = [];
  const a: number[][] = [];
  const w: number[][] = [];
  const endpoints: { node: number; line: number }[] = [];
  const nodeLine: number[] = [];
  let lines = 0;

  const nodeOf = (x: number, y: number, line: number) => {
    // Arrondi à ~1 m : les sommets partagés entre tronçons fusionnent naturellement
    const k = `${x.toFixed(5)},${y.toFixed(5)}`;
    let n = index.get(k);
    if (n === undefined) {
      n = xs.length;
      index.set(k, n);
      xs.push(x);
      ys.push(y);
      a.push([]);
      w.push([]);
      nodeLine.push(line);
    }
    return n;
  };
  const link = (u: number, v: number) => {
    if (u === v || a[u]!.includes(v)) return;
    const d = haversine(xs[u]!, ys[u]!, xs[v]!, ys[v]!);
    a[u]!.push(v);
    w[u]!.push(d);
    a[v]!.push(u);
    w[v]!.push(d);
  };

  for (const f of features) {
    if (!f.geometry || !USABLE.has(f.properties?.statut ?? '')) continue;
    const parts = (f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates]) as number[][][];
    for (const part of parts) {
      if (part.length < 2) continue;
      const lineId = lines++;
      let prev = -1;
      for (const [x, y] of part) {
        const n = nodeOf(x!, y!, lineId);
        if (prev >= 0) link(prev, n);
        prev = n;
      }
      endpoints.push({ node: nodeOf(part[0]![0]!, part[0]![1]!, lineId), line: lineId }, { node: prev, line: lineId });
    }
  }

  lon = Float64Array.from(xs);
  lat = Float64Array.from(ys);
  adj = a;
  adjW = w;
  grid.clear();
  for (let i = 0; i < xs.length; i++) {
    const k = cellKey(xs[i]!, ys[i]!);
    const c = grid.get(k);
    if (c) c.push(i);
    else grid.set(k, [i]);
  }

  // Raccorde les extrémités de tronçon au réseau voisin (bifurcations dont les sommets ne coïncident pas exactement)
  let joins = 0;
  for (const { node, line } of endpoints) {
    if (adj[node]!.length > 1) continue; // déjà une jonction
    const m = nearestNode(lon[node]!, lat[node]!, 120, (n) => nodeLine[n] === line);
    if (m >= 0) {
      link(node, m);
      joins++;
    }
  }

  railStats.nodes = xs.length;
  railStats.edges = adj.reduce((s, x) => s + x.length, 0) / 2;
  railStats.lines = lines;
  railStats.loadedAt = new Date().toISOString();
  log.info(`Graphe ferroviaire : ${lines} tronçons, ${xs.length} nœuds, ${joins} raccordements`);
}

/** Charge (ou télécharge) le réseau puis construit le graphe. Non bloquant pour le démarrage. */
export async function loadRailGraph(): Promise<void> {
  if (state === 'loading' || state === 'ready') return;
  state = 'loading';
  try {
    let raw: string | null = null;
    const fresh = fs.existsSync(CACHE_FILE) && Date.now() - fs.statSync(CACHE_FILE).mtimeMs < REFRESH_MS;
    if (fresh) {
      raw = fs.readFileSync(CACHE_FILE, 'utf8');
    } else {
      log.info('Téléchargement du réseau ferré (SNCF Réseau, ODbL)…');
      const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = await res.text();
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE, raw);
    }
    const geo = JSON.parse(raw) as { features: GeoFeature[] };
    build(geo.features);
    state = 'ready';
  } catch (err) {
    // Repli sur la copie locale même ancienne
    if (fs.existsSync(CACHE_FILE)) {
      try {
        build((JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as { features: GeoFeature[] }).features);
        state = 'ready';
        return;
      } catch {
        /* ignoré */
      }
    }
    state = 'failed';
    railStats.error = (err as Error).message;
    log.warn('Réseau ferré indisponible, les trains suivront des lignes droites :', (err as Error).message);
  }
}

// --- Plus court chemin (A*) -----------------------------------------------

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= k[i]!) break;
      [k[p], k[i]] = [k[i]!, k[p]!];
      [v[p], v[i]] = [v[i]!, v[p]!];
      i = p;
    }
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0]!;
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l]! < k[m]!) m = l;
        if (r < k.length && k[r]! < k[m]!) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i]!, k[m]!];
        [v[m], v[i]] = [v[i]!, v[m]!];
        i = m;
      }
    }
    return top;
  }
}

function astar(s: number, t: number, maxLen: number): number[] | null {
  const g = new Map<number, number>([[s, 0]]);
  const from = new Map<number, number>();
  const heap = new MinHeap();
  const tx = lon[t]!;
  const ty = lat[t]!;
  heap.push(haversine(lon[s]!, lat[s]!, tx, ty), s);
  let visited = 0;
  while (heap.size) {
    const u = heap.pop();
    if (u === t) {
      const out = [t];
      let c = t;
      while (from.has(c)) {
        c = from.get(c)!;
        out.push(c);
      }
      return out.reverse();
    }
    if (++visited > 400_000) return null;
    const gu = g.get(u)!;
    if (gu > maxLen) continue;
    const nb = adj[u]!;
    const ws = adjW[u]!;
    for (let i = 0; i < nb.length; i++) {
      const v = nb[i]!;
      const cand = gu + ws[i]!;
      if (cand < (g.get(v) ?? Infinity)) {
        g.set(v, cand);
        from.set(v, u);
        heap.push(cand + haversine(lon[v]!, lat[v]!, tx, ty), v);
      }
    }
  }
  return null;
}

/** Simplification Douglas-Peucker (tolérance en degrés, approximation locale suffisante). */
function simplify(pts: LngLat[], tol: number): LngLat[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[j]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy || 1e-18;
    let maxD = 0;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const [px, py] = pts[k]!;
      const tt = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
      const d = Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy));
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([i, idx], [idx, j]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Tracé ferroviaire entre deux gares, encodé (polyline précision 5).
 * Renvoie null si le trajet n'est pas couvert par le RFN (le client trace alors une ligne droite).
 */
export function railSegment(a: LngLat, b: LngLat): string | null {
  if (state !== 'ready') return null;
  const key = `${a[0].toFixed(4)},${a[1].toFixed(4)}>${b[0].toFixed(4)},${b[1].toFixed(4)}`;
  const hit = routeCache.get(key);
  if (hit !== undefined) return hit || null;

  const direct = haversine(a[0], a[1], b[0], b[1]);
  let result: string | null = null;
  if (direct > 50) {
    const s = nearestNode(a[0], a[1], 1500);
    const t = nearestNode(b[0], b[1], 1500);
    if (s >= 0 && t >= 0 && s !== t) {
      // Un détour de plus de 2,2× (ou +25 km) signale un trou dans le graphe : on préfère la ligne droite
      const maxLen = direct * 2.2 + 25_000;
      const nodes = astar(s, t, maxLen);
      if (nodes) {
        let len = 0;
        for (let i = 1; i < nodes.length; i++) len += haversine(lon[nodes[i - 1]!]!, lat[nodes[i - 1]!]!, lon[nodes[i]!]!, lat[nodes[i]!]!);
        if (len <= maxLen) {
          const pts: LngLat[] = [a, ...nodes.map((n) => [lon[n]!, lat[n]!] as LngLat), b];
          result = encodePolyline(simplify(pts, 0.00012)); // ~10 m
        }
      }
    }
  }
  routeCache.set(key, result ?? '');
  return result;
}
