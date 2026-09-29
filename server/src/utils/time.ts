/** Utilitaires de temps (heure de Paris) côté serveur. */

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parisOffsetMs(epochMs: number): number {
  const p: Record<string, number> = {};
  for (const { type, value } of fmt.formatToParts(new Date(epochMs))) p[type] = Number(value);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Epoch (s) de minuit, heure de Paris, pour une date YYYY-MM-DD. */
export function parisMidnightEpoch(y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const off = parisOffsetMs(guess - parisOffsetMs(guess));
  return Math.round((guess - off) / 1000);
}

/** "HHMMSS" → secondes depuis minuit */
export function hms(v: string | undefined): number | null {
  if (!v || !/^\d{6}$/.test(v)) return null;
  return +v.slice(0, 2) * 3600 + +v.slice(2, 4) * 60 + +v.slice(4, 6);
}

/** Date YYYYMMDDTHHMMSS (heure de Paris) d'un epoch en secondes. */
export function toApiDate(epochSec: number): string {
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(new Date(epochSec * 1000))) p[type] = value;
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}
