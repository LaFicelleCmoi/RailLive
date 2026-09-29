import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, sncf, toQueryString, type Params } from '../client';
import type { IsochronesResponse, JourneysResponse } from '@/types/navitia';

export function useJourneys(params: Params | null) {
  return useQuery({
    queryKey: ['journeys', params],
    queryFn: ({ signal }) => sncf<JourneysResponse>('journeys', params!, signal),
    enabled: !!params,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useIsochrones(from: string | undefined, bounds: number[], datetime: string) {
  return useQuery({
    queryKey: ['isochrones', from, bounds, datetime],
    queryFn: ({ signal }) =>
      sncf<IsochronesResponse>('isochrones', { from, 'boundary_duration[]': bounds, datetime, depth: 0 }, signal),
    enabled: !!from && bounds.length > 0,
    staleTime: 10 * 60_000,
    select: (d) => d.isochrones ?? [],
  });
}

export interface ReachablePoint {
  name: string;
  lon: number;
  lat: number;
  duration: number;
  transfers: number;
  modes: string[];
}
export interface ReachableResponse {
  from: string;
  datetime: string;
  max_duration: number;
  count: number;
  points: ReachablePoint[];
}

/** Gares atteignables (agrégation serveur de /journeys sans destination). */
export function useReachable(from: string | undefined, maxDuration: number, datetime: string) {
  return useQuery({
    queryKey: ['reachable', from, maxDuration, datetime],
    queryFn: ({ signal }) => getJson<ReachableResponse>(`/api/insights/reachable${toQueryString({ from, max_duration: maxDuration, datetime })}`, signal),
    enabled: !!from,
    staleTime: 10 * 60_000,
  });
}
