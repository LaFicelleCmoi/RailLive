import { useQuery } from '@tanstack/react-query';
import { getJson } from '../client';

export interface QuotaInfo {
  quota: {
    day: string;
    usedToday: number;
    dailyQuota: number;
    remainingEstimate: number;
    upstreamRemaining: number | null;
    upstreamHeaders: Record<string, string>;
    upstreamErrors: number;
    lastUpstreamStatus: number;
    quotaExceededAt: string | null;
  };
  cache: { entries: number; sizeBytes: number; hits: number; misses: number; coalesced: number };
}

export function useQuota() {
  return useQuery({
    queryKey: ['meta', 'quota'],
    queryFn: ({ signal }) => getJson<QuotaInfo>('/api/meta/quota', signal),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}
