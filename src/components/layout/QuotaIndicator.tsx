import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useQuota } from '@/api/hooks/useMeta';

/** Jauge compacte des appels API restants (compteur du proxy). */
export function QuotaIndicator({ compact }: { compact?: boolean }) {
  const { data, isError } = useQuota();

  if (isError) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-alert-300" title="Proxy injoignable">
        <span className="size-1.5 rounded-full bg-alert-400" /> Proxy hors ligne
      </span>
    );
  }
  if (!data) return <span className="skeleton h-5 w-24" />;

  const { usedToday, dailyQuota, upstreamRemaining } = data.quota;
  const remaining = upstreamRemaining ?? Math.max(0, dailyQuota - usedToday);
  const ratio = Math.min(1, usedToday / dailyQuota);
  const tone = ratio > 0.9 ? 'alert' : ratio > 0.7 ? 'wait' : 'info';
  const bar = tone === 'alert' ? 'bg-alert-400' : tone === 'wait' ? 'bg-wait-400' : 'bg-info-400';
  const hitRate = data.cache.hits + data.cache.misses > 0 ? data.cache.hits / (data.cache.hits + data.cache.misses) : 0;

  return (
    <Link
      to="/status"
      className="group flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.04]"
      title={`Appels à l'API SNCF aujourd'hui : ${usedToday} / ${dailyQuota}. Taux de cache : ${Math.round(hitRate * 100)} %`}
    >
      {!compact && <span className="text-[11px] font-medium text-ink-500">Quota API</span>}
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.07]">
        <span className={clsx('absolute inset-y-0 left-0 rounded-full transition-all', bar)} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="font-mono text-[11px] text-ink-300 tabular">{remaining.toLocaleString('fr-FR')}</span>
    </Link>
  );
}
