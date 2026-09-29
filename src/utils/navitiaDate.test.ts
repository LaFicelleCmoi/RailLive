import { describe, expect, it } from 'vitest';
import { delayMinutes, formatDuration, formatHms, hmsToSeconds, parseNavitiaDate, toNavitiaDate } from './navitiaDate';

describe('navitiaDate', () => {
  it('interprète les dates en heure de Paris (été, UTC+2)', () => {
    const d = parseNavitiaDate('20260715T143000');
    expect(d?.toISOString()).toBe('2026-07-15T12:30:00.000Z');
  });

  it('interprète les dates en heure de Paris (hiver, UTC+1)', () => {
    const d = parseNavitiaDate('20260115T080500');
    expect(d?.toISOString()).toBe('2026-01-15T07:05:00.000Z');
  });

  it('fait l’aller-retour Date ↔ Navitia', () => {
    expect(toNavitiaDate(parseNavitiaDate('20260929T235959')!)).toBe('20260929T235959');
  });

  it('rejette les formats invalides', () => {
    expect(parseNavitiaDate('2026-09-29')).toBeNull();
    expect(parseNavitiaDate(undefined)).toBeNull();
  });

  it('calcule un retard', () => {
    expect(delayMinutes('20260929T100000', '20260929T101200')).toBe(12);
  });

  it('formate heures et durées', () => {
    expect(formatHms('083000')).toBe('08:30');
    expect(hmsToSeconds('010203')).toBe(3723);
    expect(formatDuration(3900)).toBe('1 h 05');
    expect(formatDuration(600)).toBe('10 min');
  });
});
