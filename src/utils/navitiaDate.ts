/**
 * Conversion des dates Navitia (YYYYMMDDTHHMMSS, heure locale Europe/Paris).
 * Les dates Navitia n'ont pas de fuseau : on les interprète en heure de Paris,
 * quel que soit le fuseau du navigateur.
 */

const TZ = 'Europe/Paris';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parisParts(date: Date) {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(date)) p[type] = value;
  return {
    y: Number(p.year),
    mo: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    mi: Number(p.minute),
    s: Number(p.second),
  };
}

/** Décalage (ms) de Paris par rapport à UTC à l'instant donné. */
function parisOffsetMs(date: Date): number {
  const p = parisParts(date);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Construit une Date à partir de composantes en heure de Paris. */
export function parisDate(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const off1 = parisOffsetMs(new Date(guess));
  let ts = guess - off1;
  const off2 = parisOffsetMs(new Date(ts));
  if (off2 !== off1) ts = guess - off2;
  return new Date(ts);
}

const DT_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/;

export function parseNavitiaDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const m = DT_RE.exec(value);
  if (!m) return null;
  return parisDate(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toNavitiaDate(date: Date): string {
  const p = parisParts(date);
  return `${p.y}${pad(p.mo)}${pad(p.d)}T${pad(p.h)}${pad(p.mi)}${pad(p.s)}`;
}

/** "HHMMSS" → secondes depuis minuit */
export function hmsToSeconds(hms: string | undefined | null): number | null {
  if (!hms || !/^\d{6}$/.test(hms)) return null;
  return +hms.slice(0, 2) * 3600 + +hms.slice(2, 4) * 60 + +hms.slice(4, 6);
}

/** "HHMMSS" → "HH:MM" */
export function formatHms(hms: string | undefined | null): string {
  if (!hms || hms.length < 4) return '--:--';
  return `${hms.slice(0, 2)}:${hms.slice(2, 4)}`;
}

const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatTime = (d: Date | null) => (d ? timeFmt.format(d) : '--:--');
export const formatDay = (d: Date | null) => (d ? dateFmt.format(d) : '');
export const formatDateTime = (d: Date | null) => (d ? dateTimeFmt.format(d) : '—');

/** Formatage direct d'une date Navitia en "HH:MM". */
export const navitiaTime = (v?: string | null) => formatTime(parseNavitiaDate(v));

/** Retard en minutes entre heure théorique et heure réelle (arrondi). */
export function delayMinutes(base?: string | null, real?: string | null): number {
  const b = parseNavitiaDate(base);
  const r = parseNavitiaDate(real);
  if (!b || !r) return 0;
  return Math.round((r.getTime() - b.getTime()) / 60_000);
}

/** Durée en secondes → "1 h 05" / "42 min" */
export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${pad(r)}` : `${h} h`;
}

/** Valeur pour un <input type="datetime-local"> (heure de Paris). */
export function toDateTimeLocal(date: Date): string {
  const p = parisParts(date);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

export function fromDateTimeLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return parisDate(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!);
}

/** "YYYYMMDD" de la date de Paris */
export function parisYmd(date = new Date()): string {
  const p = parisParts(date);
  return `${p.y}${pad(p.mo)}${pad(p.d)}`;
}

export { parisParts };
