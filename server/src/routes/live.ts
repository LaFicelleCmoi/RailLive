import { Router } from 'express';
import { z } from 'zod';
import { LRUCache } from 'lru-cache';
import { sncfJson, UpstreamError } from '../sncf.js';
import { hms, parisMidnightEpoch, toApiDate } from '../utils/time.js';
import { log } from '../utils/redact.js';

/**
 * Carte live : agrégation serveur des circulations en cours.
 *
 * L'API SNCF ne fournit pas de position GPS. On récupère les circulations actives
 * (horaires théoriques + perturbations temps réel) et on renvoie une forme compacte ;
 * le navigateur interpole ensuite la position entre deux gares.
 *
 * - Échelle nationale (toujours) : TGV INOUI/Lyria, OUIGO, Intercités → 3 appels.
 * - Au zoom (≥ 8) : TER, RER/Transilien et régionaux dans un rayon autour du centre → 1 à 2 appels.
 * Les URL sont alignées sur des créneaux de 5 min : tous les visiteurs partagent le même cache.
 */
export const liveRouter = Router();

type Mode = 'tgv' | 'ouigo' | 'intercites' | 'ter' | 'transilien';

const NATIONAL: { mode: Mode; filter: string }[] = [
  {
    mode: 'tgv',
    filter: 'commercial_mode.id=commercial_mode:OUI or commercial_mode.id=commercial_mode:LYR or commercial_mode.id=commercial_mode:DBS',
  },
  { mode: 'ouigo', filter: 'commercial_mode.id=commercial_mode:TGVOUIGO or commercial_mode.id=commercial_mode:OUIGO_TC' },
  { mode: 'intercites', filter: 'commercial_mode.id=commercial_mode:IC or commercial_mode.id=commercial_mode:ICN' },
];
const REGIONAL_FILTER =
  'physical_mode.id=physical_mode:Train or physical_mode.id=physical_mode:RapidTransit or physical_mode.id=physical_mode:LongDistanceTrain';

const BUCKET_SEC = 5 * 60;
const TTL_MS = 4 * 60_000;
const PAGE = 200;

interface ApiStopTime {
  arrival_time: string;
  departure_time: string;
  stop_point: { id: string; name: string; coord: { lon: string; lat: string }; stop_area?: { id: string } };
  skipped_stop?: boolean;
}
interface ApiVJ {
  id: string;
  name: string;
  headsign?: string;
  trip?: { id: string; name: string };
  stop_times: ApiStopTime[];
  disruptions?: { id: string }[];
}
interface ApiImpactedStop {
  stop_point: { id: string };
  base_arrival_time?: string;
  base_departure_time?: string;
  amended_arrival_time?: string;
  amended_departure_time?: string;
  arrival_status?: string;
  departure_status?: string;
}
interface ApiDisruption {
  id: string;
  severity?: { effect?: string };
  messages?: { text: string }[];
  impacted_objects?: { pt_object?: { id: string; trip?: { id: string } }; impacted_stops?: ApiImpactedStop[] }[];
}
interface ApiVJResponse {
  vehicle_journeys?: ApiVJ[];
  disruptions?: ApiDisruption[];
  pagination?: { total_result: number };
}

/** Arrêt compact : [lon, lat, arrivée (s), départ (s), retard (min), nom] */
type CompactStop = [number, number, number, number, number, string];
export interface LiveTrain {
  id: string;
  n: string;
  m: Mode;
  h: string;
  dl: number;
  msg?: string;
  s: CompactStop[];
}

const Query = z.object({
  lon: z.coerce.number().min(-10).max(12).optional(),
  lat: z.coerce.number().min(40).max(52).optional(),
  zoom: z.coerce.number().min(0).max(24).default(5),
  radius: z.coerce.number().min(1).max(200).optional(),
});

/** Résultats traités, mémorisés par URL pour éviter de ré-analyser des réponses de ~1 Mo. */
const parsedCache = new LRUCache<string, { trains: LiveTrain[]; total: number }>({ max: 200, ttl: TTL_MS });

function wrap(sec: number, ref: number) {
  if (sec < ref - 43_200) return sec + 86_400;
  if (sec > ref + 43_200) return sec - 86_400;
  return sec;
}

/** Transforme une circulation de l'API en forme compacte avec horaires temps réel. */
function compact(vj: ApiVJ, disruptions: Map<string, ApiDisruption>, mode: Mode): LiveTrain | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(vj.id);
  if (!m || !vj.stop_times?.length) return null;
  const midnight = parisMidnightEpoch(+m[1]!, +m[2]!, +m[3]!);

  // Temps réel : horaires modifiés par arrêt
  const amended = new Map<string, { a?: number; d?: number; deleted: boolean }>();
  let cancelled = false;
  let msg: string | undefined;
  for (const link of vj.disruptions ?? []) {
    const d = disruptions.get(link.id);
    if (!d) continue;
    if (d.severity?.effect === 'NO_SERVICE') cancelled = true;
    msg ??= d.messages?.[0]?.text;
    for (const obj of d.impacted_objects ?? []) {
      for (const s of obj.impacted_stops ?? []) {
        const baseA = hms(s.base_arrival_time);
        const baseD = hms(s.base_departure_time);
        const a = hms(s.amended_arrival_time);
        const dd = hms(s.amended_departure_time);
        amended.set(s.stop_point.id, {
          a: a !== null && baseA !== null ? a - baseA : undefined,
          d: dd !== null && baseD !== null ? dd - baseD : undefined,
          deleted: s.arrival_status === 'deleted' && s.departure_status === 'deleted',
        });
      }
    }
  }
  if (cancelled) return null;

  const stops: CompactStop[] = [];
  let prev = -Infinity;
  for (const st of vj.stop_times) {
    let a = hms(st.arrival_time);
    let d = hms(st.departure_time);
    if (a === null || d === null) continue;
    // Passage de minuit : les horaires repartent de 00:00
    if (prev !== -Infinity) {
      a = wrap(a, prev);
      d = wrap(d, a);
    }
    if (d < a) d = a;
    prev = d;
    const rt = amended.get(st.stop_point.id);
    if (rt?.deleted || st.skipped_stop) continue;
    const da = rt?.a ?? rt?.d ?? 0;
    const dd = rt?.d ?? rt?.a ?? 0;
    const lon = Number(st.stop_point.coord.lon);
    const lat = Number(st.stop_point.coord.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || (lon === 0 && lat === 0)) continue;
    stops.push([+lon.toFixed(5), +lat.toFixed(5), midnight + a + da, midnight + d + dd, Math.round(Math.max(da, dd) / 60), st.stop_point.name]);
  }
  if (stops.length < 2) return null;
  const last = stops[stops.length - 1]!;
  return { id: vj.id, n: vj.trip?.name ?? vj.headsign ?? vj.name, m: mode, h: last[5], dl: 0, msg, s: stops };
}

/** Classe les circulations régionales à partir du suffixe de mode physique de l'identifiant. */
function regionalMode(id: string): Mode {
  if (id.endsWith(':RapidTransit')) return 'transilien';
  return 'ter';
}

async function fetchGroup(path: string, params: Record<string, string>, mode: Mode | null, maxPages: number): Promise<LiveTrain[]> {
  const out: LiveTrain[] = [];
  for (let page = 0; page < maxPages; page++) {
    const p = { ...params, count: String(PAGE), start_page: String(page), depth: '1', disable_geojson: 'true' };
    const key = `${path}?${new URLSearchParams(p).toString()}`;
    let entry = parsedCache.get(key);
    if (!entry) {
      const res = await sncfJson<ApiVJResponse>(path, p, TTL_MS);
      const dis = new Map((res.disruptions ?? []).map((d) => [d.id, d]));
      const trains = (res.vehicle_journeys ?? [])
        .map((vj) => compact(vj, dis, mode ?? regionalMode(vj.id)))
        .filter((t): t is LiveTrain => !!t);
      entry = { trains, total: res.pagination?.total_result ?? 0 };
      parsedCache.set(key, entry);
    }
    // Copie superficielle : le retard courant (dl) est recalculé à chaque requête
    out.push(...entry.trains.map((t) => ({ ...t })));
    if ((page + 1) * PAGE >= entry.total) break;
  }
  return out;
}

liveRouter.get('/trains', async (req, res) => {
  const parsed = Query.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'invalid_params', message: 'Paramètres invalides', details: parsed.error.issues.map((i) => i.message) } });
  }
  const { lon, lat, zoom, radius } = parsed.data;
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / BUCKET_SEC) * BUCKET_SEC;

  try {
    // 1. Grandes lignes, échelle nationale
    const national = await Promise.all(
      NATIONAL.map((g) =>
        fetchGroup(
          'vehicle_journeys',
          { since: toApiDate(bucket - 5 * 3600), until: toApiDate(bucket + 15 * 60), filter: g.filter },
          g.mode,
          3,
        ),
      ),
    );
    const byId = new Map<string, LiveTrain>();
    national.flat().forEach((t) => byId.set(t.id, t));

    // 2. Trains régionaux autour du centre de la vue (zoom suffisant)
    let regionalCount = 0;
    let usedRadius: number | null = null;
    if (zoom >= 8 && lon !== undefined && lat !== undefined) {
      // Centre aligné sur une grille de 0,1° et rayon par paliers : meilleure réutilisation du cache
      const cLon = Math.round(lon * 10) / 10;
      const cLat = Math.round(lat * 10) / 10;
      const wanted = Math.min(radius ?? 40, 60);
      usedRadius = wanted <= 15 ? 15 : wanted <= 30 ? 30 : 60;
      const regional = await fetchGroup(
        `coords/${cLon.toFixed(1)};${cLat.toFixed(1)}/vehicle_journeys`,
        {
          distance: String(usedRadius * 1000),
          since: toApiDate(bucket - 2 * 3600),
          until: toApiDate(bucket + 15 * 60),
          filter: REGIONAL_FILTER,
        },
        null,
        2,
      );
      for (const t of regional) {
        if (!byId.has(t.id)) {
          byId.set(t.id, t);
          regionalCount++;
        }
      }
    }

    // 3. Ne garder que les trains en circulation (ou partant dans les 10 min)
    const trains = [...byId.values()].filter((t) => {
      const first = t.s[0]!;
      const last = t.s[t.s.length - 1]!;
      return first[3] <= now + 600 && last[2] >= now - 120;
    });
    for (const t of trains) {
      // Retard courant : celui du prochain arrêt non atteint
      const next = t.s.find((s) => s[2] >= now) ?? t.s[t.s.length - 1]!;
      t.dl = next[4];
    }

    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({
      generatedAt: now,
      estimated: true,
      count: trains.length,
      regional: regionalCount,
      radiusKm: usedRadius,
      trains,
    });
  } catch (err) {
    if (err instanceof UpstreamError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    log.error('live/trains', err);
    res.status(500).json({ error: { code: 'internal', message: 'Erreur interne' } });
  }
});
