import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Grammaire des chemins autorisés                                    */
/*  chemin := ( objet "/" id ){0,3} ( collection | action )?           */
/* ------------------------------------------------------------------ */

/**
 * Collections du référentiel disponibles sur l'API SNCF (voir docs/API_SNCF.md).
 * pois, poi_types, calendars et line_groups renvoient 404 sur l'API SNCF : exclus.
 */
export const COLLECTIONS = new Set([
  'networks',
  'lines',
  'routes',
  'stop_points',
  'stop_areas',
  'commercial_modes',
  'physical_modes',
  'companies',
  'vehicle_journeys',
  'trips',
  'disruptions',
  'contributors',
  'datasets',
]);

/**
 * Actions terminales (doivent être le dernier segment).
 * heat_maps est indisponible sur l'API SNCF (pas de réseau viaire) : remplacé par /api/insights/reachable.
 * line_reports et equipment_reports répondent mais sans données : conservés pour l'affichage « non renseigné ».
 */
export const ACTIONS = new Set([
  'departures',
  'arrivals',
  'stop_schedules',
  'route_schedules',
  'terminus_schedules',
  'traffic_reports',
  'line_reports',
  'equipment_reports',
  'places_nearby',
  'journeys',
  'isochrones',
  'places',
  'pt_objects',
  'status',
]);

const ID_RE = /^[\p{L}\p{N}_:.;@+\-]{1,256}$/u;
const COORD_RE = /^-?\d{1,3}(\.\d{1,8})?;-?\d{1,2}(\.\d{1,8})?$/;

export type CacheCategory = 'realtime' | 'journeys' | 'geo' | 'search' | 'status' | 'referential' | 'schedule';

export const TTL_MS: Record<CacheCategory, number> = {
  realtime: 30_000, // horaires temps réel, perturbations
  schedule: 30_000,
  journeys: 120_000,
  geo: 10 * 60_000, // isochrones, heat maps, places_nearby
  search: 60 * 60_000, // autocomplétion
  status: 5 * 60_000,
  referential: 24 * 60 * 60_000,
};

export interface ParsedPath {
  /** Chemin sûr, ré-encodé segment par segment, relatif à la couverture. */
  safePath: string;
  category: CacheCategory;
  /** Dernier segment action/collection, pour les règles spécifiques */
  terminal?: string | null;
  /** Cible spéciale hors couverture (/coverage) */
  root?: boolean;
}

export class ForbiddenPathError extends Error {}

const REALTIME_ACTIONS = new Set(['departures', 'arrivals', 'traffic_reports', 'line_reports', 'equipment_reports']);
const SCHEDULE_ACTIONS = new Set(['stop_schedules', 'route_schedules', 'terminus_schedules']);
const REALTIME_COLLECTIONS = new Set(['vehicle_journeys', 'disruptions']);

function encodeSegment(seg: string) {
  // Les caractères « : » et « ; » sont conservés (identifiants Navitia et coordonnées).
  return encodeURIComponent(seg).replace(/%3A/gi, ':').replace(/%3B/gi, ';');
}

export function parsePath(rawPath: string): ParsedPath {
  const trimmed = rawPath.replace(/^\/+|\/+$/g, '');

  // Cibles spéciales
  if (trimmed === '_coverage') return { safePath: '', category: 'status', root: true };
  if (trimmed === '_region' || trimmed === '') return { safePath: '', category: 'status' };

  let segments: string[];
  try {
    segments = trimmed.split('/').map((s) => decodeURIComponent(s));
  } catch {
    throw new ForbiddenPathError('Chemin mal encodé');
  }
  if (segments.length > 8) throw new ForbiddenPathError('Chemin trop long');

  const out: string[] = [];
  let pairs = 0;
  let terminal: string | null = null;
  let lastCollection: string | null = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;

    if (ACTIONS.has(seg)) {
      if (i !== segments.length - 1) throw new ForbiddenPathError(`« ${seg} » doit terminer le chemin`);
      if (seg === 'status' && i !== 0) throw new ForbiddenPathError('status uniquement à la racine');
      terminal = seg;
      out.push(seg);
      continue;
    }

    if (seg === 'coords' || seg === 'coord') {
      const coord = segments[i + 1];
      if (!coord || !COORD_RE.test(coord)) throw new ForbiddenPathError('Coordonnées invalides (attendu lon;lat)');
      out.push('coords', coord);
      i++;
      pairs++;
      lastCollection = 'coords';
      continue;
    }

    if (COLLECTIONS.has(seg)) {
      const next = segments[i + 1];
      if (next === undefined) {
        terminal = seg;
        out.push(seg);
        continue;
      }
      if (ACTIONS.has(next) || COLLECTIONS.has(next)) {
        throw new ForbiddenPathError(`Identifiant attendu après « ${seg} »`);
      }
      if (!ID_RE.test(next)) throw new ForbiddenPathError('Identifiant invalide');
      out.push(seg, encodeSegment(next));
      i++;
      pairs++;
      lastCollection = seg;
      continue;
    }

    throw new ForbiddenPathError(`Segment non autorisé : « ${seg.slice(0, 40)} »`);
  }

  if (pairs > 3) throw new ForbiddenPathError('Trop de niveaux d’imbrication');

  return { safePath: out.join('/'), category: categorize(terminal, lastCollection), terminal };
}

/** Date courante au format de l'API (YYYYMMDDTHHMMSS), heure de Paris, à la minute. */
export function parisNow(offsetMs = 0): string {
  const p: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  for (const { type, value } of fmt.formatToParts(new Date(Date.now() + offsetMs))) p[type] = value;
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}00`;
}

/**
 * Règles propres à l'API SNCF, appliquées avant la validation :
 * elles protègent le quota et évitent les réponses de plusieurs mégaoctets.
 */
export function enforcePolicies(terminal: string | null | undefined, search: URLSearchParams): void {
  switch (terminal) {
    case 'route_schedules':
      // Non bornée, une grille pèse jusqu'à ~11 Mo (RER A). items_per_schedule est ignoré par l'API :
      // seule `duration` borne réellement la réponse (RER A : ~1 Mo pour 1 h). Défaut 1 h, maximum 4 h.
      if (!search.has('from_datetime')) search.set('from_datetime', parisNow());
      if (!search.has('duration')) search.set('duration', '3600');
      if (Number(search.get('duration')) > 4 * 3600) throw new InvalidParamsError(['duration : 4 h maximum']);
      break;
    case 'journeys':
      // Sans destination, la réponse fait ~8 Mo : réservé à l'agrégation serveur /api/insights/reachable.
      if (!search.get('from') || !search.get('to')) {
        throw new InvalidParamsError(['from et to sont obligatoires (voir /api/insights/reachable)']);
      }
      break;
    case 'isochrones': {
      if (!search.get('from')) throw new InvalidParamsError(['from est obligatoire']);
      if (search.getAll('boundary_duration[]').length > 4) throw new InvalidParamsError(['4 bornes maximum']);
      const max = Math.max(Number(search.get('max_duration') ?? 0), ...search.getAll('boundary_duration[]').map(Number));
      if (max > 4 * 3600) throw new InvalidParamsError(['durée maximale : 4 h']);
      break;
    }
  }
}

function categorize(terminal: string | null, lastCollection: string | null): CacheCategory {
  if (terminal) {
    if (REALTIME_ACTIONS.has(terminal)) return 'realtime';
    if (SCHEDULE_ACTIONS.has(terminal)) return 'schedule';
    if (terminal === 'journeys') return 'journeys';
    if (terminal === 'isochrones' || terminal === 'places_nearby') return 'geo';
    if (terminal === 'places' || terminal === 'pt_objects') return 'search';
    if (terminal === 'status') return 'status';
    if (REALTIME_COLLECTIONS.has(terminal)) return 'realtime';
    return 'referential';
  }
  // Objet unique : /xxx/{id}
  if (lastCollection && REALTIME_COLLECTIONS.has(lastCollection)) return 'realtime';
  if (lastCollection === 'coords') return 'geo'; // géocodage inverse
  return 'referential';
}

/* ------------------------------------------------------------------ */
/*  Paramètres autorisés                                               */
/* ------------------------------------------------------------------ */

const id = z.string().regex(ID_RE, 'identifiant invalide');
const bool = z.enum(['true', 'false']);
const dt = z.string().regex(/^\d{8}T\d{4}(\d{2})?$/, 'format attendu YYYYMMDDTHHMMSS');
const int = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,6}$/, 'entier attendu')
    .refine((v) => Number(v) >= min && Number(v) <= max, `entre ${min} et ${max}`);
const arr = <T extends z.ZodType>(item: T, max = 20) => z.array(item).max(max);
const mode = z.enum(['walking', 'bike', 'bss', 'car', 'ridesharing', 'taxi', 'car_no_park']);
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    // eslint-disable-next-line no-control-regex
    .regex(/^[^\u0000-\u001f<>]*$/u, 'caractères interdits');

/** Clé → validateur. Les clés `xxx[]` sont des tableaux. Toute autre clé est refusée. */
export const PARAMS: Record<string, z.ZodType> = {
  // Communs
  count: int(0, 200),
  start_page: int(0, 10_000),
  depth: int(0, 3),
  disable_geojson: bool,
  disable_disruption: bool,
  filter: z
    .string()
    .max(400)
    .regex(/^[\p{L}\p{N}\s_.:;=,()'"<>!&|+\-]*$/u, 'filtre invalide'),
  since: dt,
  until: dt,
  current_datetime: dt,
  data_freshness: z.enum(['realtime', 'base_schedule', 'adapted_schedule']),
  headsign: text(80),
  language: z.enum(['fr-FR', 'en-US']),
  'tags[]': arr(text(60), 10),
  // Recherche
  q: text(120),
  'type[]': arr(
    z.enum([
      'stop_area',
      'stop_point',
      'address',
      'poi',
      'administrative_region',
      'network',
      'line',
      'route',
      'commercial_mode',
      'physical_mode',
      'company',
    ]),
    11,
  ),
  distance: int(1, 50_000),
  // Itinéraires
  from: id,
  to: id,
  datetime: dt,
  datetime_represents: z.enum(['departure', 'arrival']),
  max_nb_transfers: int(0, 10),
  min_nb_transfers: int(0, 10),
  wheelchair: bool,
  'forbidden_uris[]': arr(id, 30),
  'allowed_id[]': arr(id, 30),
  'first_section_mode[]': arr(mode, 7),
  'last_section_mode[]': arr(mode, 7),
  min_nb_journeys: int(1, 20),
  max_nb_journeys: int(1, 20),
  max_duration: int(0, 86_400),
  min_duration: int(0, 86_400),
  max_walking_duration_to_pt: int(0, 7200),
  direct_path: z.enum(['indifferent', 'only', 'none', 'only_with_alternatives']),
  traveler_type: z.enum(['standard', 'slow_walker', 'fast_walker', 'luggage', 'wheelchair']),
  timeframe_duration: int(0, 86_400),
  is_journey_schedules: bool,
  // Isochrones
  'boundary_duration[]': arr(int(60, 86_400), 4),
  // Horaires
  from_datetime: dt,
  until_datetime: dt,
  duration: int(60, 86_400),
  items_per_schedule: int(1, 50),
  direction_type: z.enum(['all', 'forward', 'backward']),
  calendar: id,
  // Perturbations / rapports
  'disruption_status[]': arr(z.enum(['past', 'active', 'future']), 3),
  'forbidden_id[]': arr(id, 30),
};

export class InvalidParamsError extends Error {
  constructor(public readonly issues: string[]) {
    super('Paramètres invalides');
  }
}

/**
 * Valide et normalise la query string. Retourne une chaîne triée et ré-encodée
 * (aussi utilisée comme clé de cache).
 */
export function sanitizeQuery(search: URLSearchParams): string {
  const issues: string[] = [];
  const keys = [...new Set(search.keys())].sort();
  const out = new URLSearchParams();

  if (keys.length > 30) throw new InvalidParamsError(['Trop de paramètres']);

  for (const key of keys) {
    const schema = PARAMS[key];
    if (!schema) {
      issues.push(`Paramètre non autorisé : ${key.slice(0, 40)}`);
      continue;
    }
    const values = search.getAll(key);
    const isArray = key.endsWith('[]');
    const candidate = isArray ? values : values[values.length - 1];
    const result = schema.safeParse(candidate);
    if (!result.success) {
      issues.push(`${key} : ${result.error.issues.map((i) => i.message).join(', ')}`);
      continue;
    }
    if (isArray) for (const v of values) out.append(key, v);
    else out.set(key, candidate as string);
  }

  if (issues.length) throw new InvalidParamsError(issues);
  return out.toString();
}
