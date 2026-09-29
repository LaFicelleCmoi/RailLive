import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError, sncf } from '../client';
import { listParams, seg } from '../params';
import type { BaseResponse, DisruptionsResponse, EmbeddedType, LinesResponse, PlacesResponse, PtObjectsResponse, StopAreasResponse, VehicleJourneysResponse } from '@/types/navitia';

export type CatalogType =
  | 'networks'
  | 'lines'
  | 'routes'
  | 'stop_areas'
  | 'stop_points'
  | 'commercial_modes'
  | 'physical_modes'
  | 'companies';

export interface CatalogItem {
  id: string;
  name: string;
  raw: Record<string, unknown>;
}

const DAY = 24 * 60 * 60_000;

/** Liste paginée d'une collection du référentiel (count / start_page / filter). */
export function useCatalogList(type: CatalogType, page: number, perPage: number, scope?: string) {
  const path = scope ? `${scope}/${type}` : type;
  return useQuery({
    queryKey: ['catalog', path, page, perPage],
    queryFn: ({ signal }) => sncf<BaseResponse & Record<string, unknown>>(path, listParams({ count: perPage, start_page: page, depth: 1 }), signal),
    placeholderData: keepPreviousData,
    staleTime: DAY,
    select: (d) => ({
      items: ((d[type] as CatalogItem['raw'][] | undefined) ?? []).map((o) => ({ id: String(o.id), name: String(o.name ?? o.id), raw: o })),
      total: d.pagination?.total_result ?? 0,
    }),
  });
}

const PT_TYPE: Partial<Record<CatalogType, EmbeddedType>> = {
  networks: 'network',
  lines: 'line',
  routes: 'route',
  commercial_modes: 'commercial_mode',
};
const PLACE_TYPE: Partial<Record<CatalogType, EmbeddedType>> = {
  stop_areas: 'stop_area',
  stop_points: 'stop_point',
};

export const isSearchable = (t: CatalogType) => !!(PT_TYPE[t] || PLACE_TYPE[t]);

/** Recherche textuelle dans une collection (pt_objects ou places selon le type). */
export function useCatalogSearch(type: CatalogType, q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ['catalog-search', type, query],
    enabled: query.length >= 2 && isSearchable(type),
    staleTime: 60 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<CatalogItem[]> => {
      const pt = PT_TYPE[type];
      if (pt) {
        const d = await sncf<PtObjectsResponse>('pt_objects', { q: query, 'type[]': [pt], count: 50, depth: 1 }, signal);
        return (d.pt_objects ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          raw: ((o as unknown as Record<string, unknown>)[pt] as Record<string, unknown>) ?? {},
        }));
      }
      const d = await sncf<PlacesResponse>('places', { q: query, 'type[]': [PLACE_TYPE[type]!], count: 50, depth: 1 }, signal);
      return (d.places ?? []).map((p) => ({ id: p.id, name: p.name, raw: ((p as unknown as Record<string, unknown>)[PLACE_TYPE[type]!] as Record<string, unknown>) ?? {} }));
    },
  });
}

/** Un objet du référentiel (réseau, mode, compagnie…). */
export function useObject(type: string, id: string | undefined) {
  return useQuery({
    queryKey: ['object', type, id],
    queryFn: ({ signal }) => sncf<BaseResponse & Record<string, unknown>>(`${type}/${seg(id!)}`, { depth: 1 }, signal),
    enabled: !!id,
    staleTime: DAY,
    select: (d) => ((d[type] as Record<string, unknown>[] | undefined) ?? [])[0] ?? null,
  });
}

/** Nombre total d'objets d'une collection rattachée (count=1, on ne lit que la pagination). */
export function useRelatedCount(scope: string | undefined, collection: string) {
  return useQuery({
    queryKey: ['related-count', scope, collection],
    queryFn: ({ signal }) => sncf<BaseResponse>(`${scope}/${collection}`, { count: 1, depth: 0, disable_geojson: true }, signal),
    enabled: !!scope,
    staleTime: DAY,
    retry: false,
    select: (d) => d.pagination?.total_result ?? 0,
  });
}

export function useLineStopAreas(lineId: string | undefined) {
  return useQuery({
    queryKey: ['line', lineId, 'stop_areas'],
    queryFn: ({ signal }) => sncf<StopAreasResponse>(`lines/${seg(lineId!)}/stop_areas`, { count: 200, depth: 1 }, signal),
    enabled: !!lineId,
    staleTime: DAY,
    select: (d) => d.stop_areas ?? [],
  });
}

/** Quelques circulations de la ligne : la plus longue sert à tracer la ligne (la géométrie officielle est vide). */
export function useLineVehicleJourneys(lineId: string | undefined) {
  return useQuery({
    queryKey: ['line', lineId, 'vehicle_journeys'],
    queryFn: ({ signal }) => sncf<VehicleJourneysResponse>(`lines/${seg(lineId!)}/vehicle_journeys`, { count: 10, depth: 1, disable_geojson: true }, signal),
    enabled: !!lineId,
    staleTime: DAY,
    select: (d) => d.vehicle_journeys ?? [],
  });
}

export function useLineDisruptions(lineId: string | undefined) {
  return useQuery({
    queryKey: ['line', lineId, 'disruptions'],
    queryFn: async ({ signal }) => {
      try {
        return await sncf<DisruptionsResponse>(`lines/${seg(lineId!)}/disruptions`, { count: 30, depth: 1 }, signal);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { disruptions: [] } as DisruptionsResponse;
        throw e;
      }
    },
    enabled: !!lineId,
    refetchInterval: 60_000,
    select: (d) => (d.disruptions ?? []).filter((x) => x.status !== 'past'),
  });
}

export function useObjectLines(scope: string | undefined, page: number) {
  return useQuery({
    queryKey: ['object-lines', scope, page],
    queryFn: ({ signal }) => sncf<LinesResponse>(`${scope}/lines`, listParams({ count: 25, start_page: page, depth: 1 }), signal),
    enabled: !!scope,
    placeholderData: keepPreviousData,
    staleTime: DAY,
  });
}
