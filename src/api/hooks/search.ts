import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { sncf } from '../client';
import { seg } from '../params';
import type {
  CoordResponse,
  DisruptionsResponse,
  EmbeddedType,
  LinesResponse,
  PlacesNearbyResponse,
  PlacesResponse,
  PtObjectsResponse,
  StopAreasResponse,
  StopPointsResponse,
} from '@/types/navitia';

const DAY = 24 * 60 * 60_000;

/** Autocomplétion : gares, villes, adresses. */
export function usePlaces(q: string, types: EmbeddedType[] = ['stop_area', 'administrative_region', 'address'], count = 8) {
  const query = q.trim();
  return useQuery({
    queryKey: ['places', query, types, count],
    queryFn: ({ signal }) => sncf<PlacesResponse>('places', { q: query, 'type[]': types, count, depth: 1 }, signal),
    enabled: query.length >= 2,
    staleTime: 60 * 60_000,
    placeholderData: keepPreviousData,
    select: (d) => d.places ?? [],
  });
}

/** Recherche d'objets de transport : lignes, réseaux, modes. */
export function usePtObjects(q: string, types: EmbeddedType[] = ['line', 'network'], count = 6) {
  const query = q.trim();
  return useQuery({
    queryKey: ['pt_objects', query, types, count],
    queryFn: ({ signal }) => sncf<PtObjectsResponse>('pt_objects', { q: query, 'type[]': types, count, depth: 1 }, signal),
    enabled: query.length >= 2,
    staleTime: 60 * 60_000,
    placeholderData: keepPreviousData,
    select: (d) => d.pt_objects ?? [],
  });
}

/** Arrêts autour d'un point. */
export function usePlacesNearby(lngLat: [number, number] | null, distance = 2000, types: EmbeddedType[] = ['stop_area']) {
  return useQuery({
    queryKey: ['places_nearby', lngLat?.map((v) => v.toFixed(4)), distance, types],
    queryFn: ({ signal }) =>
      sncf<PlacesNearbyResponse>(
        `coords/${lngLat![0].toFixed(6)};${lngLat![1].toFixed(6)}/places_nearby`,
        { distance, 'type[]': types, count: 30, depth: 1 },
        signal,
      ),
    enabled: !!lngLat,
    select: (d) => d.places_nearby ?? [],
  });
}

/** Géocodage inverse. */
export function useReverseGeocode(lngLat: [number, number] | null) {
  return useQuery({
    queryKey: ['coords', lngLat?.map((v) => v.toFixed(5))],
    queryFn: ({ signal }) => sncf<CoordResponse>(`coords/${lngLat![0].toFixed(6)};${lngLat![1].toFixed(6)}`, {}, signal),
    enabled: !!lngLat,
    staleTime: DAY,
    retry: false,
  });
}

export function useStopArea(id: string | undefined) {
  return useQuery({
    queryKey: ['stop_area', id],
    queryFn: ({ signal }) => sncf<StopAreasResponse>(`stop_areas/${seg(id!)}`, { depth: 2 }, signal),
    enabled: !!id,
    staleTime: DAY,
    select: (d) => d.stop_areas?.[0] ?? null,
  });
}

export function useStopAreaLines(id: string | undefined) {
  return useQuery({
    queryKey: ['stop_area', id, 'lines'],
    queryFn: ({ signal }) => sncf<LinesResponse>(`stop_areas/${seg(id!)}/lines`, { count: 200, depth: 1, disable_geojson: true }, signal),
    enabled: !!id,
    staleTime: DAY,
    select: (d) => d.lines ?? [],
  });
}

export function useStopAreaStopPoints(id: string | undefined) {
  return useQuery({
    queryKey: ['stop_area', id, 'stop_points'],
    queryFn: ({ signal }) => sncf<StopPointsResponse>(`stop_areas/${seg(id!)}/stop_points`, { count: 100, depth: 1 }, signal),
    enabled: !!id,
    staleTime: DAY,
    select: (d) => d.stop_points ?? [],
  });
}

/** Perturbations touchant une gare (fenêtre courante). */
export function useStopAreaDisruptions(id: string | undefined) {
  return useQuery({
    queryKey: ['stop_area', id, 'disruptions'],
    queryFn: ({ signal }) => sncf<DisruptionsResponse>(`stop_areas/${seg(id!)}/disruptions`, { count: 30, depth: 1 }, signal),
    enabled: !!id,
    refetchInterval: 60_000,
    retry: false,
    select: (d) => (d.disruptions ?? []).filter((x) => x.status !== 'past'),
  });
}
