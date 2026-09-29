import { useQuery } from '@tanstack/react-query';
import { sncf } from '../client';
import type { ContributorsResponse, CoverageResponse, DatasetsResponse, StatusResponse } from '@/types/navitia';

const HOUR = 60 * 60_000;

/** Couverture « sncf » : période de production des données. */
export function useRegion() {
  return useQuery({
    queryKey: ['region'],
    queryFn: ({ signal }) => sncf<CoverageResponse>('_region', {}, signal),
    staleTime: HOUR,
    select: (d) => d.regions?.[0] ?? null,
  });
}

export function useCoverageList() {
  return useQuery({
    queryKey: ['coverage'],
    queryFn: ({ signal }) => sncf<CoverageResponse>('_coverage', {}, signal),
    staleTime: HOUR,
    select: (d) => d.regions ?? [],
  });
}

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: ({ signal }) => sncf<StatusResponse>('status', {}, signal),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'],
    queryFn: ({ signal }) => sncf<DatasetsResponse>('datasets', {}, signal),
    staleTime: HOUR,
    select: (d) => d.datasets ?? [],
  });
}

export function useContributors() {
  return useQuery({
    queryKey: ['contributors'],
    queryFn: ({ signal }) => sncf<ContributorsResponse>('contributors', {}, signal),
    staleTime: HOUR,
    select: (d) => d.contributors ?? [],
  });
}
