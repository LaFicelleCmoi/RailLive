import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, sncf, toQueryString } from '../client';
import { seg } from '../params';
import type { LinesResponse, VehicleJourneysResponse } from '@/types/navitia';
import type { TrainMode } from '@/utils/modes';
import { parisYmd } from '@/utils/navitiaDate';
import { decodePolyline } from '@/utils/polyline';
import type { LngLat } from '@/utils/geo';

export function useVehicleJourney(id: string | undefined) {
  return useQuery({
    queryKey: ['vehicle_journey', id],
    queryFn: ({ signal }) => sncf<VehicleJourneysResponse>(`vehicle_journeys/${seg(id!)}`, { depth: 2, disable_geojson: true }, signal),
    enabled: !!id,
    refetchInterval: 60_000,
  });
}

/** Ligne (et donc mode commercial / réseau) d'une circulation. */
export function useVehicleJourneyLine(id: string | undefined) {
  return useQuery({
    queryKey: ['vehicle_journey', id, 'line'],
    queryFn: ({ signal }) => sncf<LinesResponse>(`vehicle_journeys/${seg(id!)}/lines`, { depth: 1, disable_geojson: true }, signal),
    enabled: !!id,
    staleTime: 24 * 60 * 60_000,
    retry: false,
    select: (d) => d.lines?.[0] ?? null,
  });
}

/** Toutes les circulations portant un numéro donné (une par jour de circulation). */
export function useTrainsByNumber(number: string | undefined, onlyToday = false) {
  const day = parisYmd();
  return useQuery({
    queryKey: ['vj_by_number', number, onlyToday ? day : 'all'],
    queryFn: ({ signal }) =>
      sncf<VehicleJourneysResponse>(
        'vehicle_journeys',
        {
          headsign: number,
          count: 60,
          depth: 1,
          disable_geojson: true,
          since: onlyToday ? `${day}T000000` : undefined,
          until: onlyToday ? `${day}T235959` : undefined,
        },
        signal,
      ),
    enabled: !!number && /^[\w-]{1,12}$/.test(number),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    select: (d) => d.vehicle_journeys ?? [],
  });
}

/** Circulations actives maintenant sur un mode physique (liste paginée). */
export function useRunningTrains(physicalMode: string, since: string, until: string, page: number) {
  return useQuery({
    queryKey: ['running', physicalMode, since, until, page],
    queryFn: ({ signal }) =>
      sncf<VehicleJourneysResponse>(
        `physical_modes/${seg(physicalMode)}/vehicle_journeys`,
        { since, until, count: 25, start_page: page, depth: 1, disable_geojson: true },
        signal,
      ),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** Forme compacte renvoyée par /api/live/trains */
export type LiveStop = [lon: number, lat: number, arr: number, dep: number, delay: number, name: string];
export interface LiveTrain {
  id: string;
  n: string;
  m: TrainMode;
  h: string;
  dl: number;
  msg?: string;
  s: LiveStop[];
  /** Index dans `segments` du tracé ferroviaire vers l'arrêt suivant ; -1 = ligne droite */
  p?: number[];
}
export interface LiveResponse {
  generatedAt: number;
  estimated: true;
  count: number;
  regional: number;
  radiusKm: number | null;
  /** Tracés encodés (polyline), partagés entre les trains */
  segments?: string[];
  trains: LiveTrain[];
}

/**
 * Tracés sur les rails entre points successifs (gares), calculés par le serveur sur le graphe du RFN.
 * Chaque segment non couvert est remplacé par une ligne droite.
 */
export function useRailPath(points: LngLat[] | null) {
  const pts = points && points.length >= 2 ? points.slice(0, 120) : null;
  const key = pts?.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(';');
  return useQuery({
    queryKey: ['rail-path', key],
    enabled: !!key,
    staleTime: 24 * 60 * 60_000,
    retry: false,
    queryFn: ({ signal }) => getJson<{ ready: boolean; segments: (string | null)[] }>(`/api/geo/rail?pts=${key}`, signal),
    select: (d): LngLat[][] => d.segments.map((s, i) => (s ? decodePolyline(s) : [pts![i]!, pts![i + 1]!])),
  });
}

export function useLiveTrains(view: { lon: number; lat: number; zoom: number; radius: number } | null) {
  // Clé quantifiée : de petits déplacements de carte ne relancent pas de requête
  const key = !view
    ? null
    : view.zoom < 8
      ? 'national'
      : `${Math.round(view.lon * 10) / 10};${Math.round(view.lat * 10) / 10};${view.radius <= 15 ? 15 : view.radius <= 30 ? 30 : 60}`;
  return useQuery({
    queryKey: ['live', key],
    queryFn: ({ signal }) =>
      getJson<LiveResponse>(
        `/api/live/trains${toQueryString(view!.zoom < 8 ? { zoom: view!.zoom } : { zoom: view!.zoom, lon: view!.lon.toFixed(3), lat: view!.lat.toFixed(3), radius: Math.round(view!.radius) })}`,
        signal,
      ),
    enabled: !!view,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
    staleTime: 45_000,
  });
}
