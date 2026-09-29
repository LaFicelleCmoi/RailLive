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
/** Espacement maximal entre deux nœuds du graphe (m) */
const DENSIFY_M = 150;
/**
 * Rayon de raccordement d'une extrémité de tronçon à une autre ligne (m). Le fichier omet souvent
 * les voies à l'intérieur des gares (ex. Sète : 382 m entre les lignes 640000 et 810000).
 */
const JOIN_M = 600;
/** Rayon de recherche des points d'entrée sur le réseau autour d'une gare (m), la distance étant pénalisée. */
const STATION_M = 3500;

const here = path.dirname(fileURLToPath(import.meta.url));
// Sur Vercel, seul /tmp est inscriptible (cache perdu à chaque démarrage à froid)
const DATA_DIR = process.env.RAIL_DATA_DIR ?? (process.env.VERCEL ? '/tmp/railhub-data' : path.resolve(here, '../../data'));
const CACHE_FILE = path.join(DATA_DIR, 'rfn-lignes.geojson');

type LngLat = [number, number];

// --- Structure du graphe (tableaux compacts) -------------------------------
let lon: Float64Array = new Float64Array(0);
let lat: Float64Array = new Float64Array(0);
let adj: number[][] = [];
let adjW: number[][] = [];
/** Tronçon d'origine de chaque nœud */
let lineOf: Int32Array = new Int32Array(0);
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

/** Les `k` nœuds les plus proches d'un point, au plus un par tronçon, dans un rayon maximal (m). */
function nearestNodes(x: number, y: number, maxM: number, k: number): { n: number; d: number }[] {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  const ring = Math.ceil(maxM / 1500) + 1;
  const bestPerLine = new Map<number, { n: number; d: number }>();
  for (let dx = -ring; dx <= ring; dx++) {
    for (let dy = -ring; dy <= ring; dy++) {
      const cell = grid.get(`${cx + dx}:${cy + dy}`);
      if (!cell) continue;
      for (const n of cell) {
        const d = haversine(x, y, lon[n]!, lat[n]!);
        if (d > maxM) continue;
        const line = lineOf[n]!;
        const cur = bestPerLine.get(line);
        if (!cur || d < cur.d) bestPerLine.set(line, { n, d });
      }
    }
  }
  return [...bestPerLine.values()].sort((p, q) => p.d - q.d).slice(0, k);
}

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
      let px = 0;
      let py = 0;
      for (const [x, y] of part) {
        if (prev >= 0) {
          // Densification : sur les longues lignes droites le fichier n'a qu'un sommet tous les
          // quelques km ; on insère un nœud au moins tous les 150 m pour que gares et jonctions
          // trouvent toujours un point de voie à proximité.
          const steps = Math.floor(haversine(px, py, x!, y!) / DENSIFY_M);
          for (let s = 1; s <= steps; s++) {
            const f = s / (steps + 1);
            const m = nodeOf(px + (x! - px) * f, py + (y! - py) * f, lineId);
            link(prev, m);
            prev = m;
          }
        }
        const n = nodeOf(x!, y!, lineId);
        if (prev >= 0) link(prev, n);
        prev = n;
        px = x!;
        py = y!;
      }
      endpoints.push({ node: nodeOf(part[0]![0]!, part[0]![1]!, lineId), line: lineId }, { node: prev, line: lineId });
    }
  }

  lon = Float64Array.from(xs);
  lat = Float64Array.from(ys);
  adj = a;
  adjW = w;
  lineOf = Int32Array.from(nodeLine);
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
    const m = nearestNode(lon[node]!, lat[node]!, JOIN_M, (n) => nodeLine[n] === line);
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

/** Taille de la composante connexe d'un nœud (bornée), pour le diagnostic. */
function componentSize(start: number, cap = 200_000): number {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length && seen.size < cap) {
    const u = stack.pop()!;
    for (const v of adj[u]!) if (!seen.has(v)) (seen.add(v), stack.push(v));
  }
  return seen.size;
}

/** Diagnostic du routage entre deux points (outil de développement). */
export function debugGraph(a: LngLat, b: LngLat) {
  const s = nearestNode(a[0], a[1], 1500);
  const t = nearestNode(b[0], b[1], 1500);
  const info = (n: number, p: LngLat) =>
    n < 0 ? null : { node: n, at: [lon[n], lat[n]], distM: Math.round(haversine(p[0], p[1], lon[n]!, lat[n]!)), degree: adj[n]!.length, component: componentSize(n) };
  let pathM: number | null = null;
  if (s >= 0 && t >= 0) {
    const nodes = astar(s, t, Infinity);
    if (nodes) {
      pathM = 0;
      for (let i = 1; i < nodes.length; i++) pathM += haversine(lon[nodes[i - 1]!]!, lat[nodes[i - 1]!]!, lon[nodes[i]!]!, lat[nodes[i]!]!);
      pathM = Math.round(pathM);
    }
  }
  // Candidats réellement utilisés par railSegment, avec la longueur du chemin pour chaque paire
  const direct = haversine(a[0], a[1], b[0], b[1]);
  const entryM = Math.min(STATION_M, Math.max(400, direct * 0.25));
  const S = nearestNodes(a[0], a[1], entryM, 4);
  const T = nearestNodes(b[0], b[1], entryM, 4);
  const pairs = S.flatMap((x) =>
    T.map((y) => {
      const p = astar(x.n, y.n, Infinity);
      let len = 0;
      if (p) for (let i = 1; i < p.length; i++) len += haversine(lon[p[i - 1]!]!, lat[p[i - 1]!]!, lon[p[i]!]!, lat[p[i]!]!);
      return { fromD: Math.round(x.d), toD: Math.round(y.d), pathM: p ? Math.round(len) : null };
    }),
  );
  const maxLen = Math.round(direct * 1.8 + Math.min(25_000, Math.max(2_000, direct)));
  return { state, nodes: railStats.nodes, from: info(s, a), to: info(t, b), directM: Math.round(direct), pathM, entryM: Math.round(entryM), maxLen, pairs };
}

/** Projection de p sur le segment [u, v] (repère local métrique) : point projeté et distance (m). */
function projectOnSegment(p: LngLat, u: LngLat, v: LngLat): { pt: LngLat; d: number } {
  const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110_540;
  const ux = (u[0] - p[0]) * kx;
  const uy = (u[1] - p[1]) * ky;
  const vx = (v[0] - p[0]) * kx;
  const vy = (v[1] - p[1]) * ky;
  const dx = vx - ux;
  const dy = vy - uy;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ux * dx + uy * dy) / len2)) : 0;
  const px = ux + t * dx;
  const py = uy + t * dy;
  return { pt: [p[0] + px / kx, p[1] + py / ky], d: Math.hypot(px, py) };
}

/**
 * Raccorde proprement les gares au tracé : chaque gare est projetée sur le segment le plus proche
 * parmi les 3 premiers (ou derniers) kilomètres, et tout ce qui précède (ou suit) est retiré.
 * Évite les allers-retours quand le nœud le plus proche de la gare se trouve « derrière » elle.
 */
export function trimEnds(coords: LngLat[], a: LngLat, b: LngLat): LngLat[] {
  if (coords.length < 2) return coords;
  const WINDOW = 3000;
  const bestSeg = (pts: LngLat[], p: LngLat) => {
    let best = { i: 0, pt: pts[0]!, d: Infinity };
    let acc = 0;
    for (let i = 0; i < pts.length - 1 && acc <= WINDOW; i++) {
      const r = projectOnSegment(p, pts[i]!, pts[i + 1]!);
      if (r.d < best.d) best = { i, pt: r.pt, d: r.d };
      acc += haversine(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]);
    }
    return best;
  };
  const s = bestSeg(coords, a);
  let out: LngLat[] = [s.pt, ...coords.slice(s.i + 1)];
  const rev = [...out].reverse();
  const e = bestSeg(rev, b);
  out = [...rev.slice(e.i + 1).reverse(), e.pt];
  return out.length >= 2 ? out : coords;
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
    // Un détour disproportionné signale un trou dans le graphe (ou une ligne absente du RFN, ex. RATP) :
    // mieux vaut une ligne droite, que le client aimante ensuite sur la vraie voie, qu'un faux tracé.
    const maxLen = direct * 1.8 + Math.min(25_000, Math.max(2_000, direct));
    // Point d'entrée sur le réseau : proportionné à la longueur du trajet (un saut RER de 800 m ne doit
    // pas emprunter une ligne SNCF située à 3 km ; Chessy → CDG, 21 km, peut rejoindre la LGV à 2,9 km).
    const entryM = Math.min(STATION_M, Math.max(400, direct * 0.25));
    // Plusieurs nœuds candidats par gare, sur des tronçons différents : le plus proche peut être un
    // cul-de-sac (voie en impasse, jonction manquante dans les données) qui forcerait un énorme détour.
    const S = nearestNodes(a[0], a[1], entryM, 4);
    const T = nearestNodes(b[0], b[1], entryM, 4);
    let nodes: number[] | null = null;
    let bestScore = Infinity;
    const pairs = S.flatMap((s) => T.map((t) => ({ s, t }))).sort((x, y) => x.s.d + x.t.d - (y.s.d + y.t.d));
    for (const { s, t } of pairs) {
      if (s.n === t.n || s.d + t.d >= bestScore) continue;
      const path = astar(s.n, t.n, Math.min(maxLen, bestScore));
      if (!path) continue;
      let len = 0;
      for (let i = 1; i < path.length; i++) len += haversine(lon[path[i - 1]!]!, lat[path[i - 1]!]!, lon[path[i]!]!, lat[path[i]!]!);
      const score = len + s.d + t.d;
      if (score < bestScore) {
        bestScore = score;
        nodes = path;
      }
    }
    if (nodes) {
      // Supprime l'aller-retour en sortie/entrée de gare : la gare est projetée sur le segment de voie
      // le plus proche (dans les 3 premiers / derniers km) et le tracé démarre / s'arrête sur ce point.
      const trimmed = trimEnds(
        nodes.map((n) => [lon[n]!, lat[n]!] as LngLat),
        a,
        b,
      );
      let len = 0;
      for (let i = 1; i < trimmed.length; i++) len += haversine(trimmed[i - 1]![0], trimmed[i - 1]![1], trimmed[i]![0], trimmed[i]![1]);
      if (len <= maxLen) result = encodePolyline(simplify([a, ...trimmed, b], 0.00012)); // ~10 m
    }
  }
  routeCache.set(key, result ?? '');
  return result;
}
