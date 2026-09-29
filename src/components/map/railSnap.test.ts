import { describe, expect, it } from 'vitest';
import { RailSnapper } from './railSnap';

// Voie est-ouest à la latitude 43.2900 (Aubagne), et une voie nord-sud qui la croise à 5.5500
const EW = [
  [5.5, 43.29],
  [5.6, 43.29],
];
const NS = [
  [5.55, 43.25],
  [5.55, 43.33],
];

describe('RailSnapper', () => {
  it('colle un train décalé de ~300 m sur la voie la plus proche', () => {
    const s = new RailSnapper();
    s.setLines([EW]);
    const p = s.snap(5.52, 43.2927, 90, 500)!; // ~300 m au nord de la voie, cap est
    expect(p[1]).toBeCloseTo(43.29, 5);
    expect(p[0]).toBeCloseTo(5.52, 5);
  });

  it('ne colle pas au-delà du rayon', () => {
    const s = new RailSnapper();
    s.setLines([EW]);
    expect(s.snap(5.52, 43.3, 90, 500)).toBeNull(); // ~1,1 km
  });

  it('préfère la voie orientée comme le train à un croisement', () => {
    const s = new RailSnapper();
    s.setLines([EW, NS]);
    // Train roulant vers l'est, à 120 m au nord de la voie EW et à 80 m à l'ouest de la voie NS
    const p = s.snap(5.549, 43.2911, 90, 500)!;
    expect(p[1]).toBeCloseTo(43.29, 4); // reste sur la voie est-ouest
  });

  it('est inactif sans voies', () => {
    const s = new RailSnapper();
    s.setLines([]);
    expect(s.active).toBe(false);
    expect(s.snap(5.5, 43.29, 0, 500)).toBeNull();
  });

  it('reste sur la voie précédente plutôt que sauter sur une voie parallèle', () => {
    const s = new RailSnapper();
    const EW2 = [
      [5.5, 43.2936],
      [5.6, 43.2936],
    ]; // voie parallèle à 400 m au nord
    s.setLines([EW, EW2]);
    // Train à mi-chemin (200 m de chaque voie), un peu plus près de EW2 : sans historique il va sur EW2…
    expect(s.snap(5.52, 43.2919, 90, 600)![1]).toBeCloseTo(43.2936, 4);
    // … mais s'il était sur EW à l'image précédente, il y reste
    expect(s.snap(5.52, 43.2919, 90, 600, [5.5199, 43.29])![1]).toBeCloseTo(43.29, 4);
  });

  it('garde les voies des autres niveaux de zoom en secours', () => {
    const s = new RailSnapper();
    s.addLines([EW], 10);
    s.addLines([NS], 14); // niveau affiché : seules les voies nord-sud sont chargées
    // Loin de NS : le train est collé à la voie EW connue au niveau 10
    const p = s.snap(5.52, 43.2927, 90, 600)!;
    expect(p[1]).toBeCloseTo(43.29, 5);
  });
});
