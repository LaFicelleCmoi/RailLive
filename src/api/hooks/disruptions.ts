import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { ApiError, sncf } from '../client';
import { seg } from '../params';
import type {
  DisruptionsResponse,
  EquipmentReportsResponse,
  LineReportsResponse,
  TrafficReportsResponse,
  VehicleJourneysResponse,
} from '@/types/navitia';
import type { Favorite } from '@/store/favorites';

export function useDisruptionsList(since: string, until: string, page: number, count = 100) {
  return useQuery({
    queryKey: ['disruptions', since, until, page, count],
    queryFn: ({ signal }) => sncf<DisruptionsResponse>('disruptions', { since, until, count, start_page: page, depth: 1 }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useTrafficReports() {
  return useQuery({
    queryKey: ['traffic_reports'],
    queryFn: ({ signal }) => sncf<TrafficReportsResponse>('traffic_reports', { count: 50, depth: 1 }, signal),
    refetchInterval: 60_000,
  });
}

/** Renvoie null quand l'API ne fournit pas de données (cas de l'API SNCF). */
export function useLineReports() {
  return useQuery({
    queryKey: ['line_reports'],
    queryFn: async ({ signal }) => {
      try {
        return await sncf<LineReportsResponse>('line_reports', { count: 50, depth: 1 }, signal);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.code === 'no_solution')) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 10 * 60_000,
  });
}

export function useEquipmentReports() {
  return useQuery({
    queryKey: ['equipment_reports'],
    queryFn: async ({ signal }) => {
      try {
        return await sncf<EquipmentReportsResponse>('equipment_reports', { count: 50, depth: 1 }, signal);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 10 * 60_000,
  });
}

export interface FavoriteAlert {
  fav: Favorite;
  count: number;
  label: string;
}

/**
 * Surveille les favoris (5 gares + 5 trains max. pour préserver le quota)
 * et renvoie ceux touchés par une perturbation active.
 */
export function useFavoriteAlerts(favs: Favorite[]) {
  const watched = [...favs.filter((f) => f.kind === 'station').slice(0, 5), ...favs.filter((f) => f.kind === 'train').slice(0, 5)];
  const results = useQueries({
    queries: watched.map((f) => ({
      queryKey: ['fav-alert', f.id],
      refetchInterval: 120_000,
      staleTime: 60_000,
      retry: false,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<FavoriteAlert | null> => {
        try {
          if (f.kind === 'station') {
            const d = await sncf<DisruptionsResponse>(`stop_areas/${seg(f.id)}/disruptions`, { count: 20, depth: 1 }, signal);
            const active = (d.disruptions ?? []).filter((x) => x.status === 'active');
            return active.length ? { fav: f, count: active.length, label: active[0]?.messages?.[0]?.text ?? 'Perturbation en cours' } : null;
          }
          const d = await sncf<VehicleJourneysResponse>(`vehicle_journeys/${seg(f.id)}`, { depth: 0 }, signal);
          const active = (d.disruptions ?? []).filter((x) => x.status !== 'past');
          return active.length ? { fav: f, count: active.length, label: active[0]?.messages?.[0]?.text ?? 'Perturbation en cours' } : null;
        } catch (e) {
          // 404 = aucune perturbation (ou circulation expirée)
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }
      },
    })),
  });
  return results.map((r) => r.data).filter((x): x is FavoriteAlert => !!x);
}
