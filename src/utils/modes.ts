/**
 * Classification des circulations par famille commerciale.
 * L'API SNCF ne fournit pas de couleur de ligne pour les trains : on colore par famille.
 */

export type TrainMode = 'tgv' | 'ouigo' | 'intercites' | 'ter' | 'transilien' | 'coach' | 'other';

export const MODE_META: Record<TrainMode, { label: string; short: string; color: string }> = {
  tgv: { label: 'TGV INOUI / Lyria', short: 'TGV', color: '#b18cff' },
  ouigo: { label: 'OUIGO', short: 'OUIGO', color: '#ff6fb5' },
  intercites: { label: 'Intercités', short: 'IC', color: '#66a6ff' },
  ter: { label: 'TER', short: 'TER', color: '#4fd3ea' },
  transilien: { label: 'Transilien / RER', short: 'RER', color: '#7ee0a8' },
  coach: { label: 'Car', short: 'Car', color: '#f7c257' },
  other: { label: 'Autre', short: '—', color: '#b8c2d3' },
};

/** Filtres proposés sur la carte live. */
export const LIVE_MODES: TrainMode[] = ['tgv', 'ouigo', 'intercites', 'ter', 'transilien'];

export function classifyMode(commercialMode?: string | null, network?: string | null, physicalMode?: string | null): TrainMode {
  const s = `${commercialMode ?? ''} ${network ?? ''}`.toLowerCase();
  const p = (physicalMode ?? '').toLowerCase();
  if (s.includes('ouigo')) return 'ouigo';
  if (s.includes('tgv') || s.includes('inoui') || s.includes('lyria') || s.includes('db sncf') || s.includes('eurostar')) return 'tgv';
  if (s.includes('intercit')) return 'intercites';
  if (s.includes('transilien') || /\brer\b/.test(s) || p.includes('rapid')) return 'transilien';
  if (p.includes('coach') || p.includes('bus') || p === 'autocar') return 'coach';
  if (p.includes('train') || s.trim()) return 'ter';
  return 'other';
}

export function modeColor(mode: TrainMode): string {
  return MODE_META[mode].color;
}

/** Couleur d'affichage : couleur officielle si fournie (RER/Transilien), sinon couleur de famille. */
export function displayColor(color: string | undefined | null, mode: TrainMode): string {
  if (color && /^#?[0-9a-f]{6}$/i.test(color)) return color.startsWith('#') ? color : `#${color}`;
  return modeColor(mode);
}

/** Filtres « exclure un mode » pour les itinéraires (forbidden_uris[]). */
export const FORBIDDABLE: { id: string; label: string }[] = [
  { id: 'commercial_mode:OUI', label: 'TGV INOUI' },
  { id: 'commercial_mode:TGVOUIGO', label: 'OUIGO' },
  { id: 'commercial_mode:LYR', label: 'TGV Lyria' },
  { id: 'commercial_mode:IC', label: 'Intercités' },
  { id: 'commercial_mode:ICN', label: 'Intercités de nuit' },
  { id: 'commercial_mode:TER', label: 'TER' },
  { id: 'physical_mode:RapidTransit', label: 'RER / Transilien' },
  { id: 'physical_mode:Coach', label: 'Cars' },
  { id: 'physical_mode:Bus', label: 'Bus' },
];
