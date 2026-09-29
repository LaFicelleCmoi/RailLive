import type { FeatureCollection } from 'geojson';
import type { Journey, Section } from '@/types/navitia';
import { classifyMode, displayColor } from '@/utils/modes';
import { delayMinutes } from '@/utils/navitiaDate';
import { toLngLat, type LngLat } from '@/utils/geo';

export const JOURNEY_TAG: Record<string, string> = {
  best: 'Recommandé',
  rapid: 'Rapide',
  fastest: 'Le plus rapide',
  comfort: 'Confort',
  less_fallback_walk: 'Moins de marche',
  less_fallback_bike: 'Moins de vélo',
  car: 'Voiture',
  non_pt_walk: 'À pied',
  non_pt_bike: 'À vélo',
};

export const STREET_MODE_LABEL: Record<string, string> = {
  walking: 'Marche',
  bike: 'Vélo',
  car: 'Voiture',
  bss: 'Vélo en libre-service',
  ridesharing: 'Covoiturage',
  taxi: 'Taxi',
};

export function sectionColor(s: Section): string {
  if (s.type === 'public_transport' && s.display_informations) {
    const di = s.display_informations;
    return displayColor(di.color, classifyMode(di.commercial_mode, di.network, di.physical_mode));
  }
  if (s.type === 'transfer') return '#f7c257';
  return '#8d99ae';
}

export function journeyDelay(j: Journey): number {
  return Math.max(0, ...j.sections.map((s) => delayMinutes(s.base_arrival_date_time, s.arrival_date_time)));
}

export function ptSections(j: Journey): Section[] {
  return j.sections.filter((s) => s.type === 'public_transport' || s.type === 'on_demand_transport');
}

/** Géométries des sections d'un trajet, colorées par mode. */
export function journeyFC(j: Journey | undefined, selected = true): FeatureCollection {
  if (!j) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: j.sections
      .filter((s) => s.geojson?.coordinates?.length || (s.from && s.to))
      .map((s) => {
        let coords: LngLat[] = (s.geojson?.coordinates ?? []) as LngLat[];
        if (!coords.length) {
          const a = placeLngLat(s.from);
          const b = placeLngLat(s.to);
          coords = a && b ? [a, b] : [];
        }
        return {
          type: 'Feature' as const,
          id: s.id,
          properties: {
            id: s.id,
            color: sectionColor(s),
            kind: s.type === 'public_transport' ? 'pt' : s.type === 'transfer' ? 'transfer' : 'street',
            selected: selected ? 1 : 0,
          },
          geometry: { type: 'LineString' as const, coordinates: coords },
        };
      })
      .filter((f) => f.geometry.coordinates.length >= 2),
  };
}

/** Arrêts desservis (points) d'un trajet. */
export function journeyStopsFC(j: Journey | undefined): FeatureCollection {
  if (!j) return { type: 'FeatureCollection', features: [] };
  const feats: FeatureCollection['features'] = [];
  j.sections.forEach((s, si) => {
    if (s.type !== 'public_transport') return;
    (s.stop_date_times ?? []).forEach((sdt, i, arr) => {
      const ll = toLngLat(sdt.stop_point?.coord);
      if (!ll) return;
      const terminal = i === 0 || i === arr.length - 1;
      feats.push({
        type: 'Feature',
        id: `${si}-${i}`,
        properties: { name: sdt.stop_point?.name ?? '', terminal: terminal ? 1 : 0, color: sectionColor(s) },
        geometry: { type: 'Point', coordinates: ll },
      });
    });
  });
  return { type: 'FeatureCollection', features: feats };
}

export function placeLngLat(p: Section['from']): LngLat | null {
  if (!p) return null;
  return toLngLat(p.stop_point?.coord ?? p.stop_area?.coord ?? p.address?.coord ?? p.administrative_region?.coord ?? p.poi?.coord);
}

export function journeyPoints(j: Journey | undefined): LngLat[] {
  if (!j) return [];
  return j.sections.flatMap((s) => (s.geojson?.coordinates as LngLat[] | undefined) ?? [placeLngLat(s.from), placeLngLat(s.to)].filter((x): x is LngLat => !!x));
}
