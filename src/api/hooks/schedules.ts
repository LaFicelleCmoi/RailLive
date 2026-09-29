import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { sncf } from '../client';
import { seg } from '../params';
import type {
  ArrivalsResponse,
  DataFreshness,
  DeparturesResponse,
  LinesResponse,
  RouteSchedulesResponse,
  RoutesResponse,
  StopSchedulesResponse,
  TerminusSchedulesResponse,
} from '@/types/navitia';

export type BoardType = 'departures' | 'arrivals';

/** Panneau départs / arrivées, rafraîchi toutes les 30 s. */
export function useBoard(stopId: string | undefined, type: BoardType, count = 30, freshness: DataFreshness = 'realtime') {
  return useQuery({
    queryKey: ['board', stopId, type, count, freshness],
    queryFn: ({ signal }) =>
      sncf<DeparturesResponse & ArrivalsResponse>(
        `stop_areas/${seg(stopId!)}/${type}`,
        { count, depth: 1, data_freshness: freshness, disable_geojson: true },
        signal,
      ),
    enabled: !!stopId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    staleTime: 25_000,
  });
}

export function useStopSchedules(stopId: string | undefined, lineId?: string, itemsPerSchedule = 6) {
  return useQuery({
    queryKey: ['stop_schedules', stopId, lineId, itemsPerSchedule],
    queryFn: ({ signal }) =>
      sncf<StopSchedulesResponse>(
        lineId ? `stop_areas/${seg(stopId!)}/lines/${seg(lineId)}/stop_schedules` : `stop_areas/${seg(stopId!)}/stop_schedules`,
        { items_per_schedule: itemsPerSchedule, count: 50, depth: 1, data_freshness: 'realtime', disable_geojson: true },
        signal,
      ),
    enabled: !!stopId,
    refetchInterval: 60_000,
    select: (d) => ({ schedules: d.stop_schedules ?? [], disruptions: d.disruptions ?? [] }),
  });
}

export function useTerminusSchedules(stopId: string | undefined, itemsPerSchedule = 5) {
  return useQuery({
    queryKey: ['terminus_schedules', stopId, itemsPerSchedule],
    queryFn: ({ signal }) =>
      sncf<TerminusSchedulesResponse>(
        `stop_areas/${seg(stopId!)}/terminus_schedules`,
        { items_per_schedule: itemsPerSchedule, count: 60, depth: 1, data_freshness: 'realtime', disable_geojson: true },
        signal,
      ),
    enabled: !!stopId,
    refetchInterval: 60_000,
    select: (d) => d.terminus_schedules ?? [],
  });
}

export function useLine(lineId: string | undefined) {
  return useQuery({
    queryKey: ['line', lineId],
    queryFn: ({ signal }) => sncf<LinesResponse>(`lines/${seg(lineId!)}`, { depth: 2, disable_geojson: true }, signal),
    enabled: !!lineId,
    staleTime: 24 * 60 * 60_000,
    select: (d) => d.lines?.[0] ?? null,
  });
}

export function useLineRoutes(lineId: string | undefined) {
  return useQuery({
    queryKey: ['line', lineId, 'routes'],
    queryFn: ({ signal }) => sncf<RoutesResponse>(`lines/${seg(lineId!)}/routes`, { depth: 1, count: 50, disable_geojson: true }, signal),
    enabled: !!lineId,
    staleTime: 24 * 60 * 60_000,
    select: (d) => d.routes ?? [],
  });
}

export function useRoute(routeId: string | undefined) {
  return useQuery({
    queryKey: ['route', routeId],
    queryFn: ({ signal }) => sncf<RoutesResponse>(`routes/${seg(routeId!)}`, { depth: 2, disable_geojson: true }, signal),
    enabled: !!routeId,
    staleTime: 24 * 60 * 60_000,
    select: (d) => d.routes?.[0] ?? null,
  });
}

/** Grille horaire d'un parcours (le proxy borne la fenêtre : 1 h par défaut, 4 h max). */
export function useRouteSchedules(routeId: string | undefined, fromDatetime: string, duration: number) {
  return useQuery({
    queryKey: ['route_schedules', routeId, fromDatetime, duration],
    queryFn: ({ signal }) =>
      sncf<RouteSchedulesResponse>(
        `routes/${seg(routeId!)}/route_schedules`,
        { from_datetime: fromDatetime, duration, depth: 1, data_freshness: 'realtime', disable_geojson: true },
        signal,
      ),
    enabled: !!routeId,
    placeholderData: keepPreviousData,
    select: (d) => d.route_schedules?.[0] ?? null,
  });
}
