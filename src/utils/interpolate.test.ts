import { describe, expect, it } from 'vitest';
import { interpolatePosition, type TimedStop } from './interpolate';

const stops: TimedStop[] = [
  { lon: 0, lat: 0, a: 1000, d: 1000 },
  { lon: 10, lat: 0, a: 2000, d: 2120 },
  { lon: 10, lat: 10, a: 3120, d: 3120 },
];

describe('interpolatePosition', () => {
  it('attend en gare avant le départ', () => {
    const p = interpolatePosition(stops, 500)!;
    expect(p.state).toBe('waiting');
    expect([p.lon, p.lat]).toEqual([0, 0]);
  });

  it('interpole linéairement à mi-parcours', () => {
    const p = interpolatePosition(stops, 1500, false)!;
    expect(p.state).toBe('running');
    expect(p.lon).toBeCloseTo(5);
    expect(p.lat).toBeCloseTo(0);
    expect(p.progress).toBeCloseTo(0.5);
  });

  it('le lissage conserve le milieu et les extrémités', () => {
    expect(interpolatePosition(stops, 1500)!.lon).toBeCloseTo(5);
    expect(interpolatePosition(stops, 1001)!.lon).toBeLessThan(0.1);
  });

  it('reste à quai pendant l’arrêt', () => {
    const p = interpolatePosition(stops, 2060)!;
    expect(p.state).toBe('dwelling');
    expect([p.lon, p.lat]).toEqual([10, 0]);
    expect(p.index).toBe(1);
  });

  it('calcule le cap (nord sur le 2e tronçon)', () => {
    const p = interpolatePosition(stops, 2600)!;
    expect(p.bearing).toBeCloseTo(0, 0);
  });

  it('est arrivé après le terminus', () => {
    const p = interpolatePosition(stops, 99999)!;
    expect(p.state).toBe('arrived');
    expect([p.lon, p.lat]).toEqual([10, 10]);
  });

  it('gère les listes vides', () => {
    expect(interpolatePosition([], 0)).toBeNull();
  });
});
